import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelCollection, collectTable, getCollectionProgress, inspectTables, validateSnapshot } from '../src/content/engine';
import { engineState } from '../src/shared/engine-state';
import * as virtualScroller from '../src/extractors/virtualized/virtualScroller';
import type { TableCandidate } from '../src/extractors/types';

const initialUrl = document.URL;
beforeEach(() => {
  engineState.snapshot = undefined;
  engineState.collection = undefined;
  engineState.collectionProgress = undefined;
  document.body.innerHTML = '<table><thead><tr><th>姓名</th><th>金额</th></tr></thead><tbody><tr><td>张三</td><td>100</td></tr></tbody></table>';
});
afterEach(() => {
  vi.restoreAllMocks();
  engineState.collection?.abort();
  engineState.collection = undefined;
  engineState.snapshot = undefined;
  document.body.replaceChildren();
  history.replaceState(null, '', initialUrl);
});
function scanned() {
  const snapshot = inspectTables();
  expect(snapshot.tables).toHaveLength(1);
  const table = snapshot.tables[0]!;
  expect(table.snapshotId).toBe(snapshot.snapshotId);
  return table;
}
function virtualPage() {
  document.body.innerHTML = '<div role="grid" aria-rowcount="4" aria-colcount="1" style="overflow:auto"><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1">名称</div></div><div role="row" aria-rowindex="2" data-row-key="R001"><div role="gridcell" aria-colindex="1">甲</div></div></div>';
  Object.defineProperties(document.querySelector('[role="grid"]')!, { clientHeight: { value: 20 }, scrollHeight: { value: 100 } });
}

describe('content snapshot lifecycle', () => {
  it('validates the same matrix and uses an opaque token without URL or content', () => {
    const table = scanned();
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: true });
    expect(table.snapshotId).not.toContain('张三');
    expect(table.snapshotId).not.toContain(document.URL);
  });
  it('blocks edited cell text while keeping the preview matrix unchanged', () => {
    const table = scanned();
    document.querySelector('td')!.textContent = '李四';
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'TABLE_CHANGED' });
    expect(table.rows[1]).toEqual(['张三', '100']);
  });
  it('blocks a changed business input property even without a DOM attribute mutation', () => {
    document.querySelector('td')!.innerHTML = '<input value="张三">';
    const table = scanned();
    const input = document.querySelector('input')!;
    input.value = '李四';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'TABLE_CHANGED' });
    expect(table.rows[1]).toEqual(['张三', '100']);
  });
  it('ignores cosmetic style and class animation while detecting visibility changes', () => {
    const table = scanned();
    const element = document.querySelector('table')!;
    element.classList.add('animation-frame-2');
    element.style.outline = '1px solid red';
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: true });
    element.style.display = 'none';
    expect(validateSnapshot(table.snapshotId!, table.id).valid).toBe(false);
  });
  it('blocks deleted or replaced source tables', () => {
    const table = scanned();
    document.querySelector('table')!.outerHTML = '<table><tr><th>姓名</th><th>金额</th></tr><tr><td>张三</td><td>100</td></tr></table>';
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'TABLE_REMOVED' });
  });
  it('blocks SPA navigation even when the table contents remain the same', () => {
    const table = scanned();
    history.pushState(null, '', '/other-page?query=private#detail');
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'PAGE_CHANGED' });
    const fresh = scanned();
    expect(validateSnapshot(fresh.snapshotId!, fresh.id)).toEqual({ valid: true });
  });
  it('invalidates old inspection tokens while retaining stable table IDs', () => {
    const table = scanned();
    const fresh = scanned();
    expect(fresh.id).toBe(table.id);
    expect(fresh.snapshotId).not.toBe(table.snapshotId);
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'STALE_SNAPSHOT' });
    expect(validateSnapshot(fresh.snapshotId!, fresh.id)).toEqual({ valid: true });
  });
  it('fails closed for missing tokens, unknown IDs, or a reloaded isolated state', () => {
    const table = scanned();
    expect(validateSnapshot('', table.id).valid).toBe(false);
    expect(validateSnapshot(table.snapshotId!, 'missing-table').valid).toBe(false);
    engineState.snapshot = undefined;
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'STALE_SNAPSHOT' });
  });
  it('rejects a detached same-origin frame even if its old document retains nodes', () => {
    document.body.innerHTML = '<iframe></iframe>';
    const frame = document.querySelector('iframe')!;
    frame.contentDocument!.body.innerHTML = '<table><tr><th>名称</th></tr><tr><td>内嵌数据</td></tr></table>';
    const table = scanned();
    expect(validateSnapshot(table.snapshotId!, table.id).valid).toBe(true);
    frame.remove();
    expect(validateSnapshot(table.snapshotId!, table.id).valid).toBe(false);
  });
  it('rejects navigation inside a same-origin frame', () => {
    document.body.innerHTML = '<iframe></iframe>';
    const frame = document.querySelector('iframe')!;
    frame.contentDocument!.body.innerHTML = '<table><tr><th>名称</th></tr><tr><td>内嵌数据</td></tr></table>';
    const table = scanned();
    frame.contentWindow!.location.hash = '#new-view';
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'PAGE_CHANGED' });
  });
  it('validates tables in open shadow roots and detects their cell updates', () => {
    document.body.innerHTML = '<open-table></open-table>';
    const root = document.querySelector('open-table')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<table><tr><th>名称</th></tr><tr><td>影子数据</td></tr></table>';
    const table = scanned();
    expect(validateSnapshot(table.snapshotId!, table.id).valid).toBe(true);
    root.querySelector('td')!.textContent = '已更新';
    expect(validateSnapshot(table.snapshotId!, table.id).valid).toBe(false);
  });
  it('refuses collection after the scanned table changed', async () => {
    const table = scanned();
    document.querySelector('td')!.textContent = '已更新';
    const collect = vi.spyOn(virtualScroller, 'collectVirtualTable');
    await expect(collectTable(table.id)).rejects.toThrow('重新扫描');
    expect(collect).not.toHaveBeenCalled();
  });
  it('reports verified business-row progress, preserves cancellation, and issues a fresh collected token', async () => {
    virtualPage();
    const table = scanned();
    let finish!: (candidate: TableCandidate) => void;
    let signal: AbortSignal | undefined;
    let original: TableCandidate | undefined;
    vi.spyOn(virtualScroller, 'collectVirtualTable').mockImplementation((candidate, _read, options = {}) => {
      original = candidate;
      signal = options.signal;
      options.onProgress?.(3, 2);
      return new Promise((resolve) => { finish = resolve; });
    });
    expect(getCollectionProgress()).toEqual({ rows: 0, iterations: 0, running: false });
    const pending = collectTable(table.id);
    expect(getCollectionProgress()).toEqual({ rows: 3, iterations: 2, running: true });
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'COLLECTION_RUNNING' });
    cancelCollection();
    expect(signal?.aborted).toBe(true);
    finish({ ...original!, rows: [['名称'], ['甲'], ['乙'], ['丙']], metadata: { ...original!.metadata,
      headerRows: 1, complete: false, unsupported_reason: 'ABORTED', rowMeta: [
        { kind: 'header', index: 1 }, { kind: 'data', index: 2, key: 'R001' },
        { kind: 'data', index: 3, key: 'R002' }, { kind: 'data', index: 4, key: 'R003' },
      ] } });
    const collected = await pending;
    expect(getCollectionProgress()).toEqual({ rows: 3, iterations: 2, running: false });
    expect(collected.rows).toEqual([['名称'], ['甲'], ['乙'], ['丙']]);
    expect(table.rows).toEqual([['名称'], ['甲']]);
    expect(collected.snapshotId).not.toBe(table.snapshotId);
    expect(validateSnapshot(table.snapshotId!, table.id).valid).toBe(false);
    expect(validateSnapshot(collected.snapshotId!, collected.id)).toEqual({ valid: true });
  });
  it('does not make previously gathered rows valid after navigation during collection', async () => {
    virtualPage();
    const table = scanned();
    let finish!: () => void;
    vi.spyOn(virtualScroller, 'collectVirtualTable').mockImplementation((candidate) => new Promise((resolve) => {
      finish = () => resolve(candidate);
    }));
    const pending = collectTable(table.id);
    history.pushState(null, '', '/different-page');
    finish();
    await expect(pending).rejects.toThrow('重新扫描');
    expect(getCollectionProgress().running).toBe(false);
    expect(validateSnapshot(table.snapshotId!, table.id)).toEqual({ valid: false, reason: 'PAGE_CHANGED' });
  });
  it('does not overwrite a newer inspection with an older in-flight collection', async () => {
    virtualPage();
    const table = scanned();
    let finish!: () => void;
    vi.spyOn(virtualScroller, 'collectVirtualTable').mockImplementation((candidate) => new Promise((resolve) => {
      finish = () => resolve(candidate);
    }));
    const pending = collectTable(table.id);
    const newer = scanned();
    finish();
    await expect(pending).rejects.toThrow('重新扫描');
    expect(getCollectionProgress().running).toBe(false);
    expect(validateSnapshot(table.snapshotId!, table.id).valid).toBe(false);
    expect(validateSnapshot(newer.snapshotId!, newer.id)).toEqual({ valid: true });
  });
  it('preserves an aborted partial result after unmount without issuing an exportable snapshot', async () => {
    virtualPage();
    const table = scanned();
    let finish!: () => void;
    vi.spyOn(virtualScroller, 'collectVirtualTable').mockImplementation((candidate) => new Promise((resolve) => {
      finish = () => resolve({ ...candidate, metadata: { ...candidate.metadata,
        complete: false, unsupported_reason: 'ABORTED', collectionVerified: false } });
    }));
    const pending = collectTable(table.id);
    document.querySelector('[role="grid"]')!.remove();
    finish();
    const partial = await pending;
    expect(partial.rows).toEqual(table.rows);
    expect(partial.diagnostics.completeness).not.toBe('complete');
    expect(partial.diagnostics.warnings.map((warning) => warning.code)).toContain('COLLECTION_ABORTED');
    expect(partial.snapshotId).toBeUndefined();
    expect(engineState.snapshot).toBeUndefined();
    expect(validateSnapshot(table.snapshotId!, table.id).valid).toBe(false);
    expect(getCollectionProgress().running).toBe(false);
    expect(inspectTables().tables).toEqual([]);
  });
});
