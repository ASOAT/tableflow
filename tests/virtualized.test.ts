import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectVirtualTable } from '../src/extractors/virtualized/virtualScroller';
import { RowCollector } from '../src/extractors/virtualized/rowCollector';
import { virtualLimits } from '../src/extractors/virtualized/config';
import type { TableCandidate } from '../src/extractors/types';

function grid(options: { total?: number; unstable?: boolean; stuck?: boolean } = {}) {
  const element = document.createElement('div');
  element.style.overflowY = 'auto';
  document.body.append(element);
  Object.defineProperties(element, { clientHeight: { value: 20 }, scrollHeight: { value: 100 } });
  element.scrollTop = 40;
  element.scrollLeft = 7;
  const snapshot = (): TableCandidate => {
    const start = options.stuck ? 0 : Math.min(8, Math.floor(element.scrollTop / 10));
    const indices = [start + 2, start + 3];
    return { id: 'test-grid', type: 'aria-grid', confidence: 0.94, sourceElement: element,
      rows: [['名称', '值'], ...indices.map(() => ['相同内容', 'a,b'])], columns: 2,
      metadata: { headerRows: 1, complete: false, virtualized: true,
        expectedRowCount: options.total ?? 11,
        rowMeta: [{ kind: 'header', index: 1 }, ...indices.map((index) => ({ kind: 'data' as const,
          ...(options.unstable ? {} : { index }) }))] } };
  };
  return { element, snapshot };
}
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('bounded virtual row collection', () => {
  it('collects beyond DOM slots, preserves legitimate duplicate rows and restores both scroll axes', async () => {
    const { element, snapshot } = grid();
    const result = await collectVirtualTable(snapshot(), snapshot, { limits: { settleMs: 1, stepRatio: 0.5 } });
    expect(result.metadata.complete).toBe(true);
    expect(result.rows).toHaveLength(11);
    expect(result.rows.slice(1)).toEqual(Array.from({ length: 10 }, () => ['相同内容', 'a,b']));
    expect(element.scrollTop).toBe(40); expect(element.scrollLeft).toBe(7);
  });
  it.each([
    [{ maxRows: 3 }, 'ROW_LIMIT'],
    [{ maxIterations: 1 }, 'ITERATION_LIMIT'],
    [{ timeoutMs: 1, settleMs: 10 }, 'TIMEOUT'],
  ] as const)('reports bounded early exits and restores the page', async (limits, code) => {
    const { element, snapshot } = grid();
    const result = await collectVirtualTable(snapshot(), snapshot, { limits: { settleMs: 1, ...limits } });
    expect(result.metadata.complete).toBe(false);
    expect(result.metadata.unsupported_reason).toBe(code);
    expect(element.scrollTop).toBe(40);
  });
  it('terminates when scrolling yields no new identified rows', async () => {
    const { snapshot } = grid({ stuck: true });
    const result = await collectVirtualTable(snapshot(), snapshot,
      { limits: { settleMs: 1, noNewRowsThreshold: 2, stepRatio: 0.1 } });
    expect(result.metadata.unsupported_reason).toBe('INCOMPLETE_GRID');
  });
  it('does not claim complete when text-only identity is uncertain', async () => {
    const { snapshot } = grid({ unstable: true });
    const result = await collectVirtualTable(snapshot(), snapshot, { limits: { settleMs: 1 } });
    expect(result.metadata.complete).toBe(false);
    expect(result.confidence).toBeLessThan(0.4);
    expect(result.metadata.unsupported_reason).toBe('VIRTUAL_ROW_IDENTITY_UNCERTAIN');
  });
  it('supports cancel and always restores position', async () => {
    const { element, snapshot } = grid();
    const controller = new AbortController(); controller.abort();
    const result = await collectVirtualTable(snapshot(), snapshot, { signal: controller.signal, limits: { settleMs: 1 } });
    expect(result.metadata.unsupported_reason).toBe('ABORTED');
    expect(element.scrollTop).toBe(40);
  });
  it('propagates extractor failures while restoring position', async () => {
    const { element, snapshot } = grid();
    await expect(collectVirtualTable(snapshot(), () => { throw new Error('broken DOM'); },
      { limits: { settleMs: 1 } })).rejects.toThrow('broken DOM');
    expect(element.scrollTop).toBe(40);
  });
  it('refuses completeness when declared total changes during collection', async () => {
    const { snapshot } = grid();
    const original = snapshot();
    const result = await collectVirtualTable(original, () => ({ ...snapshot(),
      metadata: { ...snapshot().metadata, expectedRowCount: 12 } }), { limits: { settleMs: 1 } });
    expect(result.metadata.complete).toBe(false);
    expect(result.metadata.unsupported_reason).toBe('ABORTED');
    expect(result.metadata.headerRows).toBe(1);
    expect(result.metadata.expectedRowCount).toBe(12);
  });
  it('reports unsupported scroll containers explicitly', async () => {
    const { element, snapshot } = grid(); element.style.overflowY = 'visible';
    const result = await collectVirtualTable(snapshot(), snapshot);
    expect(result.metadata.unsupported_reason).toBe('UNSUPPORTED_STRUCTURE');
  });
  it('detects conflicting values for the same stable row identity', () => {
    const { snapshot } = grid(); const collector = new RowCollector();
    collector.add(snapshot(), 100);
    const changed = snapshot(); changed.rows[1]![0] = '变化'; collector.add(changed, 100);
    expect(collector.conflicts).toBe(true);
  });
  it('validates centralized collection limits', () => {
    expect(() => virtualLimits({ timeoutMs: Number.NaN })).toThrow();
    expect(() => virtualLimits({ maxRows: 0 })).toThrow();
    expect(virtualLimits({ maxRows: 1_000_000 }).maxRows).toBe(10_000);
  });
  it('never promotes a vertically collected grid with absent columns to complete', async () => {
    const { snapshot } = grid();
    const original = snapshot(); original.metadata.missingColumns = true;
    const result = await collectVirtualTable(original, snapshot, { limits: { settleMs: 1 } });
    expect(result.metadata.complete).toBe(false);
    expect(result.metadata.unsupported_reason).toBe('INCOMPLETE_GRID');
  });
  it('rejects structure becoming malformed during scrolling', async () => {
    const { snapshot } = grid();
    const result = await collectVirtualTable(snapshot(), () => ({ ...snapshot(),
      metadata: { ...snapshot().metadata, unsupported_reason: 'MALFORMED_STRUCTURE' } }), { limits: { settleMs: 1 } });
    expect(result.metadata.complete).toBe(false);
    expect(result.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
  });
  it('detects replaced row keys even if equal text and row index conceal the change', () => {
    const { snapshot } = grid(); const collector = new RowCollector();
    const initial = snapshot(); initial.metadata.rowMeta![1]!.key = 'original'; collector.add(initial, 100);
    const replacement = snapshot(); replacement.metadata.rowMeta![1]!.key = 'replacement'; collector.add(replacement, 100);
    expect(collector.conflicts).toBe(true);
  });
  it('detects changing summary values across snapshots', () => {
    const { snapshot } = grid(); const collector = new RowCollector();
    const initial = snapshot(); initial.rows.push(['汇总', '10']); initial.metadata.rowMeta!.push({ kind: 'summary' });
    collector.add(initial, 100); initial.rows.at(-1)![1] = '20'; collector.add(initial, 100);
    expect(collector.conflicts).toBe(true);
  });
  it('detects schema width changes across disjoint rendered windows', () => {
    const { snapshot } = grid(); const collector = new RowCollector();
    collector.add(snapshot(), 100);
    const changed = snapshot(); changed.columns = 3;
    changed.rows = changed.rows.map((row) => [...row, '新增列']); collector.add(changed, 100);
    expect(collector.conflicts).toBe(true);
  });
  it('blocks mixed records after values change for an already collected identity', async () => {
    const { snapshot } = grid(); let reads = 0;
    const result = await collectVirtualTable(snapshot(), () => {
      const current = snapshot();
      if (++reads > 1) current.rows[1]![0] = '已修改';
      return current;
    }, { limits: { settleMs: 1, stepRatio: 0.1 } });
    expect(result.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
    expect(result.metadata.complete).toBe(false);
  });
});
