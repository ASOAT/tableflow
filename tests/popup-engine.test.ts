import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineSnapshot, TableCandidateView } from '../src/shared/engine';
import type { Completeness, ExtractionDiagnostics } from '../src/shared/diagnostics';
import { toCsv } from '../src/exporters/delimited';
import type { DebugReport } from '../src/shared/debug-report';
const initialPopupUrl = window.location.href;

function table(id = 'table-1', complete = true): TableCandidateView {
  return { id, snapshotId: 'snapshot-1', type: 'aria-grid', confidence: 0.94, rows: [['姓名', '备注'], ['张三', '<img onerror=alert(1)>']], columns: 2,
    diagnostics: { confidence: 0.94, completeness: complete ? 'complete' : 'visible-only', extractedRows: 1,
      ...(!complete ? { expectedRows: 119 } : {}), extractedColumns: 2, paginationDetected: false,
      virtualizationDetected: !complete, warnings: complete ? [] : [{ code: 'VISIBLE_ROWS_ONLY' }], evidence: [] },
    metadata: { headerRows: 1, complete, ...(!complete ? { virtualized: true, expectedRowCount: 120,
      unsupported_reason: 'INCOMPLETE_GRID' as const, warnings: ['只有已渲染行。'] } : {}) } };
}
function withState(state: Completeness, diagnostics: Partial<ExtractionDiagnostics> = {}): TableCandidateView {
  const candidate = table();
  candidate.diagnostics = { ...candidate.diagnostics, completeness: state, ...diagnostics };
  return candidate;
}
function debugData(): DebugReport {
  return { version: '0.4.0', browser: 'Chromium', origin: 'https://example.com', extractor: 'aria-grid',
    adapter: 'aria-grid', confidence: 0.94, diagnostics: table().diagnostics,
    structure: { rows: 2, columns: 2, headerRows: 1, roles: { row: 2 }, openShadow: false } };
}
function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<T>((resolveValue, rejectValue) => { resolvePromise = resolveValue; rejectPromise = rejectValue; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
async function flush(): Promise<void> { for (let turn = 0; turn < 12; turn += 1) await Promise.resolve(); }

afterEach(() => {
  vi.doUnmock('../src/popup/scan-page');
  vi.doUnmock('../src/popup/site-icons');
  vi.doUnmock('../src/exporters/clipboard');
  vi.doUnmock('../src/exporters/delimited');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
  window.history.replaceState(null, '', initialPopupUrl);
});

describe('Popup engine injection API', () => {
  let tabId: number;
  let documentId: string;
  let scanner: { inspectTables: ReturnType<typeof vi.fn>; collectTable: ReturnType<typeof vi.fn>; cancelCollection: ReturnType<typeof vi.fn>;
    generateDebugReport: ReturnType<typeof vi.fn>; validateSnapshot: ReturnType<typeof vi.fn>; getCollectionProgress: ReturnType<typeof vi.fn> };
  let executeScript: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('../src/popup/scan-page');
    tabId = 12;
    documentId = 'original-document';
    scanner = { inspectTables: vi.fn(() => ({ tables: [table()], diagnostics: [] })),
      collectTable: vi.fn(async () => table()), cancelCollection: vi.fn(), generateDebugReport: vi.fn(debugData),
      validateSnapshot: vi.fn(() => ({ valid: true })), getCollectionProgress: vi.fn(() => ({ rows: 320, iterations: 5, running: true })) };
    executeScript = vi.fn(async (injection: { files?: string[]; func?: () => unknown; args?: unknown[] }) => {
      if (injection.files) return [{ documentId, frameId: 0 }];
      const result = await runInNewContext(`(${injection.func!.toString()})(...args)`, {
        TableFlowScanner: scanner, args: injection.args ?? [],
      });
      return [{ documentId, frameId: 0, result }];
    });
    vi.stubGlobal('chrome', {
      tabs: { query: async () => [{ id: tabId, url: 'https://example.com/' }] },
      scripting: { executeScript },
    });
  });

  it('inspects using a self-contained function, unified options and a pinned document', async () => {
    const api = await import('../src/popup/scan-page');
    await expect(api.inspectActivePage({ includeLowConfidence: true })).resolves.toEqual({ tables: [table()], diagnostics: [] });
    expect(scanner.inspectTables).toHaveBeenCalledWith({ includeLowConfidence: true });
    expect(executeScript.mock.calls[1]?.[0]).toMatchObject({
      target: { tabId: 12, documentIds: ['original-document'] }, world: 'ISOLATED',
    });
  });

  it('collects from the same inspected document and forwards bounded limits', async () => {
    const api = await import('../src/popup/scan-page');
    await api.inspectActivePage();
    await expect(api.collectActiveTable('table-1', { maxRows: 120 })).resolves.toEqual(table());
    expect(scanner.collectTable).toHaveBeenCalledWith('table-1', { maxRows: 120 });
    expect(executeScript.mock.calls[3]?.[0]).toMatchObject({ target: { tabId: 12, documentIds: ['original-document'] } });
  });

  it('rejects a changed document or active tab before collecting any data', async () => {
    const api = await import('../src/popup/scan-page');
    await api.inspectActivePage();
    documentId = 'new-document';
    await expect(api.collectActiveTable('table-1')).rejects.toThrow('网页已变化');
    expect(scanner.collectTable).not.toHaveBeenCalled();
    await api.inspectActivePage();
    tabId = 13;
    await expect(api.collectActiveTable('table-1')).rejects.toThrow('网页已变化');
    expect(scanner.collectTable).not.toHaveBeenCalled();
  });

  it('cancels the original in-flight document even when another tab becomes active', async () => {
    const api = await import('../src/popup/scan-page');
    await api.inspectActivePage();
    const completion = deferred<TableCandidateView>();
    const started = deferred<void>();
    scanner.collectTable.mockImplementation(() => { started.resolve(); return completion.promise; });
    const collection = api.collectActiveTable('table-1');
    await started.promise;
    tabId = 13;
    await api.cancelActiveCollection();
    expect(scanner.cancelCollection).toHaveBeenCalledOnce();
    expect(executeScript.mock.calls.at(-1)?.[0]).toMatchObject({ target: { tabId: 12, documentIds: ['original-document'] } });
    completion.resolve(table());
    await collection;
  });

  it('rejects malformed engine results and treats idle cancellation as a no-op', async () => {
    const api = await import('../src/popup/scan-page');
    await api.cancelActiveCollection();
    expect(executeScript).not.toHaveBeenCalled();
    scanner.inspectTables.mockReturnValue({ tables: [] });
    await expect(api.inspectActivePage()).rejects.toThrow('无法读取此页面');
  });

  it('requests only a local debug DTO from the inspected document and rejects navigation', async () => {
    const api = await import('../src/popup/scan-page');
    await api.inspectActivePage();
    await expect(api.generateActiveDebugReport('table-1')).resolves.toEqual(debugData());
    expect(scanner.generateDebugReport).toHaveBeenCalledWith('table-1');
    expect(executeScript.mock.calls.at(-1)?.[0]).toMatchObject({ target: { tabId: 12, documentIds: ['original-document'] } });
    documentId = 'changed-document';
    await expect(api.generateActiveDebugReport('table-1')).rejects.toThrow('网页已变化');
    expect(scanner.generateDebugReport).toHaveBeenCalledOnce();
  });

  it('validates the original snapshot token in the pinned document without injecting or extracting a replacement', async () => {
    const api = await import('../src/popup/scan-page');
    await api.inspectActivePage();
    await expect(api.validateActiveSnapshot(table())).resolves.toEqual({ valid: true });
    expect(scanner.validateSnapshot).toHaveBeenCalledExactlyOnceWith('snapshot-1', 'table-1');
    expect(scanner.inspectTables).toHaveBeenCalledOnce();
    expect(executeScript.mock.calls.at(-1)?.[0]).toMatchObject({ target: { tabId: 12, documentIds: ['original-document'] }, args: ['snapshot-1', 'table-1'] });
    expect(executeScript.mock.calls.filter(([call]) => call.files)).toHaveLength(1);
    scanner.validateSnapshot.mockReturnValue({ valid: false, reason: 'TABLE_CHANGED' });
    await expect(api.validateActiveSnapshot(table())).resolves.toEqual({ valid: false, reason: 'TABLE_CHANGED' });
    const noToken = table(); delete noToken.snapshotId;
    await expect(api.validateActiveSnapshot(noToken)).resolves.toMatchObject({ valid: false });
    tabId = 13;
    await expect(api.validateActiveSnapshot(table())).resolves.toEqual({ valid: false, reason: 'PAGE_CHANGED' });
    expect(scanner.validateSnapshot).toHaveBeenCalledTimes(2);
  });

  it('polls real progress from the original collection document without repeated injection', async () => {
    const api = await import('../src/popup/scan-page');
    await api.inspectActivePage();
    const completion = deferred<TableCandidateView>(); const started = deferred<void>();
    scanner.collectTable.mockImplementation(() => { started.resolve(); return completion.promise; });
    const collection = api.collectActiveTable('table-1'); await started.promise;
    tabId = 13;
    await expect(api.getActiveCollectionProgress()).resolves.toEqual({ rows: 320, iterations: 5, running: true });
    expect(executeScript.mock.calls.at(-1)?.[0]).toMatchObject({ target: { tabId: 12, documentIds: ['original-document'] } });
    expect(executeScript.mock.calls.filter(([call]) => call.files)).toHaveLength(2);
    completion.resolve(table()); await collection;
    await expect(api.getActiveCollectionProgress()).resolves.toBeUndefined();
  });

  it('retains the pinned tab only when our exact popup is foreground, including rescan', async () => {
    const api = await import('../src/popup/scan-page');
    await api.inspectActivePage();
    const tabs = chrome.tabs as unknown as { query: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
    tabs.query = vi.fn(async () => [{ id: 30, url: 'chrome-extension://our-extension/popup.html?local=1' }]);
    tabs.get = vi.fn(async () => ({ id: 12, url: 'https://example.com/' }));
    Object.assign(chrome, { runtime: { getManifest: () => ({ action: { default_popup: 'popup.html' } }),
      getURL: (path: string) => `chrome-extension://our-extension/${path}` } });
    await expect(api.validateActiveSnapshot(table())).resolves.toEqual({ valid: true });
    expect(tabs.get).toHaveBeenCalledWith(12);
    await expect(api.inspectActivePage()).resolves.toMatchObject({ tables: [table()] });
    tabs.query.mockResolvedValue([{ id: 30 }]);
    Object.assign(tabs, { getCurrent: async () => ({ id: 30 }) });
    vi.stubGlobal('location', { href: 'chrome-extension://our-extension/popup.html' });
    await expect(api.validateActiveSnapshot(table())).resolves.toEqual({ valid: true });
    for (const url of ['chrome-extension://other-extension/popup.html', 'chrome-extension://our-extension/privacy.html', 'edge://extensions/']) {
      tabs.query.mockResolvedValue([{ id: 30, url }]);
      await expect(api.validateActiveSnapshot(table())).resolves.toEqual({ valid: false, reason: 'PAGE_CHANGED' });
    }
    expect(scanner.validateSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe('Popup unified results and explicit collection UI', () => {
  let mocks: {
    inspectActivePage: ReturnType<typeof vi.fn>; collectActiveTable: ReturnType<typeof vi.fn>; cancelActiveCollection: ReturnType<typeof vi.fn>;
    copyMatrix: ReturnType<typeof vi.fn>; applyTableIconsToActivePage: ReturnType<typeof vi.fn>; saveSiteIcons: ReturnType<typeof vi.fn>;
    createObjectURL: ReturnType<typeof vi.fn<(blob: Blob | MediaSource) => string>>;
    toCsv: ReturnType<typeof vi.fn>; generateActiveDebugReport: ReturnType<typeof vi.fn>;
    validateActiveSnapshot: ReturnType<typeof vi.fn>; getActiveCollectionProgress: ReturnType<typeof vi.fn>;
    storageGet: ReturnType<typeof vi.fn>; storageSet: ReturnType<typeof vi.fn>;
  };
  const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
  const text = (id: string) => document.querySelector(`#${id}`)?.textContent ?? '';
  async function start(): Promise<void> { await import('../src/popup/main'); await flush(); }
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('DEV', false);
    const html = readFileSync(resolve('src', 'popup', 'index.html'), 'utf8');
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
    mocks = {
      inspectActivePage: vi.fn(async (): Promise<EngineSnapshot> => ({ tables: [table(), table('table-2', false)], diagnostics: [] })),
      collectActiveTable: vi.fn(async () => ({ ...table('table-2'), rows: [['姓名', '备注'], ['完整', '数据']] })),
      cancelActiveCollection: vi.fn(async () => undefined), copyMatrix: vi.fn(async () => undefined),
      applyTableIconsToActivePage: vi.fn(async () => undefined), saveSiteIcons: vi.fn(async () => undefined),
      createObjectURL: vi.fn<(blob: Blob | MediaSource) => string>(() => 'blob:tableflow-test'),
      toCsv: vi.fn((rows: string[][]) => toCsv(rows)),
      generateActiveDebugReport: vi.fn(async () => ({ version: '0.4.0', origin: 'https://example.com', rowCount: 1, columnCount: 2 })),
      validateActiveSnapshot: vi.fn(async () => ({ valid: true })), getActiveCollectionProgress: vi.fn(async () => undefined),
      storageGet: vi.fn(async () => ({ onboardingSeen: true, uiLanguage: 'zh-CN' })), storageSet: vi.fn(async () => undefined),
    };
    vi.doMock('../src/popup/scan-page', async () => ({ ...await vi.importActual('../src/popup/scan-page'), ...mocks,
      getActivePage: async () => ({ id: 12, url: 'https://example.com/' }),
    }));
    vi.doMock('../src/popup/site-icons', () => ({ isSiteEnabled: async () => false, saveSiteIcons: mocks.saveSiteIcons }));
    vi.doMock('../src/exporters/clipboard', () => ({ copyMatrix: mocks.copyMatrix }));
    vi.doMock('../src/exporters/delimited', () => ({ toCsv: mocks.toCsv }));
    const OriginalURL = URL;
    class TestURL extends OriginalURL {
      static override createObjectURL(blob: Blob | MediaSource): string { return mocks.createObjectURL(blob) as string; }
      static override revokeObjectURL = vi.fn<(url: string) => void>();
    }
    vi.stubGlobal('URL', TestURL);
    vi.stubGlobal('chrome', { permissions: { request: vi.fn(async () => true) },
      storage: { local: { get: mocks.storageGet, set: mocks.storageSet } }, runtime: { getManifest: () => ({ version: '0.5.0' }) } });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  function selectSecond(): void {
    const radio = document.querySelectorAll<HTMLInputElement>('input[name="table"]')[1]!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  }

  it('shows type/confidence/header information and uses text for unsafe-looking values and diagnostics', async () => {
    mocks.inspectActivePage.mockResolvedValue({ tables: [table()], diagnostics: [
      { code: 'CLOSED_SHADOW_ROOT', unsupported_reason: 'CLOSED_SHADOW_ROOT', certainty: 'possible', message: '<img> closed host 无法确认' },
    ] });
    await start();
    expect(text('selection-title')).toBe('表格 1');
    expect(text('technical-summary')).toContain('表头 1 行');
    expect(text('technical-summary')).toContain('94%');
    expect(text('selection-summary')).toBe('1 行 × 2 列');
    expect(text('matrix-preview')).toContain('<img onerror=alert(1)>');
    expect(text('scan-diagnostics')).toContain('CLOSED_SHADOW_ROOT: <img>');
    expect(document.querySelector<HTMLDetailsElement>('#scan-details')!.open).toBe(false);
    expect(document.querySelector('img')).toBeNull();
    expect(button('copy').disabled).toBe(false);
  });

  it('requires a confirmation for visible data, collects explicitly, then waits for a separate copy click', async () => {
    await start();
    selectSecond();
    expect(button('copy').disabled).toBe(false);
    expect(button('export-csv').disabled).toBe(false);
    expect(button('collect').hidden).toBe(false);
    expect(text('table-warnings')).toContain('已渲染的 1 行');
    button('copy').click();
    expect(document.querySelector<HTMLDialogElement>('#export-confirm')?.open).toBe(true);
    expect(mocks.copyMatrix).not.toHaveBeenCalled();
    button('cancel-export').click();
    button('collect').click();
    expect(mocks.collectActiveTable).toHaveBeenCalledWith('table-2');
    expect(button('rescan').disabled).toBe(true);
    await flush();
    expect(mocks.copyMatrix).not.toHaveBeenCalled();
    expect(button('copy').disabled).toBe(false);
    expect(button('collect').hidden).toBe(true);
    expect(text('selection-title')).toBe('表格 2');
    button('copy').click();
    await flush();
    expect(mocks.copyMatrix).toHaveBeenCalledWith([['姓名', '备注'], ['完整', '数据']]);
  });

  it('keeps cancelled collections incomplete and restores the controls', async () => {
    const completion = deferred<TableCandidateView>();
    mocks.collectActiveTable.mockReturnValue(completion.promise);
    await start();
    selectSecond();
    button('collect').click();
    button('cancel-collect').click();
    expect(mocks.cancelActiveCollection).toHaveBeenCalledOnce();
    completion.resolve({ ...table('table-2', false), metadata: { ...table('table-2', false).metadata,
      unsupported_reason: 'ABORTED', warnings: ['用户已取消。'] } });
    await flush();
    expect(button('copy').disabled).toBe(true);
    expect(button('export-csv').disabled).toBe(true);
    expect(button('cancel-collect').hidden).toBe(true);
    expect(button('rescan').disabled).toBe(false);
    expect(text('action-status')).toContain('已取消');
  });

  it('blocks invalid extraction output even if its diagnostic state is unknown', async () => {
    const incomplete = table('table-1', false);
    incomplete.metadata.virtualized = false;
    incomplete.metadata.unsupported_reason = 'MALFORMED_STRUCTURE';
    incomplete.diagnostics.completeness = 'unknown';
    mocks.inspectActivePage.mockResolvedValue({ tables: [incomplete], diagnostics: [] });
    await start();
    expect(button('copy').disabled).toBe(true);
    expect(button('export-csv').disabled).toBe(true);
    expect(button('collect').hidden).toBe(true);
    button('copy').dispatchEvent(new Event('click'));
    button('export-csv').dispatchEvent(new Event('click'));
    expect(mocks.copyMatrix).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it('resets stale selection on rescan and maps the low-confidence switch to engine options', async () => {
    await start();
    mocks.inspectActivePage.mockResolvedValue({ tables: [], diagnostics: [] });
    const checkbox = document.querySelector<HTMLInputElement>('#include-layout')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(document.querySelector<HTMLElement>('#selection')?.hidden).toBe(true);
    expect(button('copy').disabled).toBe(true);
    await flush();
    expect(mocks.inspectActivePage).toHaveBeenLastCalledWith({ includeLowConfidence: true });
    expect(text('status')).toContain('没有找到数据表');
    expect(document.querySelectorAll('input[name="table"]')).toHaveLength(0);
  });

  it('preserves incomplete state and shows a collection error', async () => {
    mocks.collectActiveTable.mockRejectedValue(new Error('网页已变化，请重新扫描。'));
    await start();
    selectSecond();
    button('collect').click();
    await flush();
    expect(button('copy').disabled).toBe(true);
    expect(button('collect').disabled).toBe(false);
    expect(text('action-status')).toContain('网页已变化');
  });

  it('downloads complete CSV locally and preserves the website permission gesture', async () => {
    await start();
    button('export-csv').click();
    await flush();
    expect(mocks.createObjectURL).toHaveBeenCalledOnce();
    expect((mocks.createObjectURL.mock.calls[0]?.[0] as Blob | undefined)?.type).toBe('text/csv;charset=utf-8');
    const site = document.querySelector<HTMLInputElement>('#site-icons')!;
    site.checked = true;
    site.dispatchEvent(new Event('change'));
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
    await flush();
    expect(mocks.saveSiteIcons).toHaveBeenCalledWith('https://example.com/*', true, expect.any(Promise));
    expect(mocks.applyTableIconsToActivePage).toHaveBeenCalledWith(true);
  });

  it('exports current-page scope directly and tells the user the extracted and total row counts', async () => {
    const candidate = withState('current-page', { expectedRows: 1200, paginationDetected: true,
      warnings: [{ code: 'PAGINATION_DETECTED', metadata: { extracted: 1, total: 1200 } }] });
    candidate.metadata.complete = false;
    mocks.inspectActivePage.mockResolvedValue({ tables: [candidate], diagnostics: [] });
    await start();
    expect(text('selection-state')).toBe('当前页');
    expect(text('table-warnings')).toContain('本页 1 行');
    expect(text('table-warnings')).toContain('1,200');
    button('copy').click();
    await flush();
    expect(mocks.copyMatrix).toHaveBeenCalledWith(candidate.rows);
    expect(document.querySelector<HTMLDialogElement>('#export-confirm')?.open).toBe(false);
    await flush();
    button('export-csv').click();
    await flush();
    expect(mocks.toCsv).toHaveBeenCalledWith(candidate.rows);
    expect(mocks.createObjectURL).toHaveBeenCalledOnce();
  });

  it.each(['visible-only', 'possibly-incomplete', 'unknown'] as const)('confirms %s before copying or downloading exactly the current matrix', async (state) => {
    const candidate = withState(state, { expectedRows: state === 'unknown' ? undefined : 1200,
      virtualizationDetected: state !== 'unknown' });
    mocks.inspectActivePage.mockResolvedValue({ tables: [candidate], diagnostics: [] });
    await start();
    expect(text('selection-state')).toBe(state === 'unknown' ? '无法判断' : state === 'visible-only' ? '仅当前可见' : '可能不完整');
    expect(button('copy').disabled).toBe(false);
    button('copy').click();
    expect(document.querySelector<HTMLDialogElement>('#export-confirm')?.open).toBe(true);
    expect(mocks.copyMatrix).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(text('export-confirm-notice')).toContain('当前已提取：1 行 × 2 列');
    button('confirm-export').click();
    await flush();
    // Validation keeps the preview's exact matrix; no fresh extraction is exported.
    expect(mocks.copyMatrix).toHaveBeenCalledExactlyOnceWith(candidate.rows);
    await flush();
    button('export-csv').click();
    expect(mocks.toCsv).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    button('confirm-export').click();
    await flush();
    expect(mocks.toCsv).toHaveBeenCalledExactlyOnceWith(candidate.rows);
    expect(mocks.createObjectURL).toHaveBeenCalledOnce();
  });

  it('cancels risky exports without changing clipboard or generating a file', async () => {
    mocks.inspectActivePage.mockResolvedValue({ tables: [withState('unknown')], diagnostics: [] });
    await start();
    button('copy').click();
    button('cancel-export').click();
    button('export-csv').click();
    button('cancel-export').click();
    expect(mocks.copyMatrix).not.toHaveBeenCalled();
    expect(mocks.toCsv).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLDialogElement>('#export-confirm')?.open).toBe(false);
  });

  it('supports an old compatibility stub but invalidates a pending export when rescanning', async () => {
    const legacy = table('table-1', false);
    delete (legacy as { diagnostics?: ExtractionDiagnostics }).diagnostics;
    mocks.inspectActivePage.mockResolvedValue({ tables: [legacy], diagnostics: [] });
    await start();
    expect(text('selection-state')).toBe('仅当前可见');
    button('export-csv').click();
    expect(document.querySelector<HTMLDialogElement>('#export-confirm')?.open).toBe(true);
    mocks.inspectActivePage.mockResolvedValue({ tables: [], diagnostics: [] });
    button('rescan').dispatchEvent(new Event('click'));
    button('confirm-export').dispatchEvent(new Event('click'));
    await flush();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.toCsv).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLDialogElement>('#export-confirm')?.open).toBe(false);
  });

  it('keeps support reporting in Help and a query parameter cannot enable developer tools', async () => {
    window.history.replaceState(null, '', '?debug=1');
    await start();
    expect(document.querySelector<HTMLDialogElement>('#help-dialog')!.open).toBe(false);
    button('debug-report').dispatchEvent(new Event('click'));
    expect(mocks.generateActiveDebugReport).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
  });

  it('generates local sanitized support JSON only from an explicit Help action', async () => {
    mocks.generateActiveDebugReport.mockResolvedValue(debugData());
    await start();
    button('help').click();
    expect(document.querySelector<HTMLDialogElement>('#help-dialog')!.open).toBe(true);
    button('debug-report').click();
    await flush();
    expect(mocks.generateActiveDebugReport).toHaveBeenCalledWith('table-1');
    expect(mocks.createObjectURL).toHaveBeenCalledOnce();
    expect((mocks.createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe('application/json;charset=utf-8');
    expect(mocks.toCsv).not.toHaveBeenCalled();
    expect(text('report-status')).toContain('不包含表格业务内容');
  });

  it('persists real first-use acknowledgement locally and does not scan behind the introductory dialog', async () => {
    const stored: Record<string, unknown> = {};
    mocks.storageGet.mockImplementation(async () => ({ ...stored }));
    mocks.storageSet.mockImplementation(async (value: Record<string, unknown>) => { Object.assign(stored, value); });
    await start();
    expect(document.querySelector<HTMLDialogElement>('#onboarding-dialog')!.open).toBe(true);
    expect(mocks.inspectActivePage).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('start-using'));
    button('start-using').click(); await flush();
    expect(stored.onboardingSeen).toBe(true);
    expect(document.querySelector<HTMLDialogElement>('#onboarding-dialog')!.open).toBe(false);
    expect(mocks.inspectActivePage).toHaveBeenCalledOnce();
    vi.resetModules();
    const html = readFileSync(resolve('src', 'popup', 'index.html'), 'utf8');
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
    await start();
    expect(document.querySelector<HTMLDialogElement>('#onboarding-dialog')!.open).toBe(false);
    expect(mocks.inspectActivePage).toHaveBeenCalledTimes(2);
  });

  it('switches all business UI and warning messages to English while preserving the exact snapshot', async () => {
    const candidate = withState('visible-only', { expectedRows: 1200, warnings: [{ code: 'ROW_COUNT_MISMATCH', metadata: { extracted: 1, expected: 1200 } }] });
    mocks.inspectActivePage.mockResolvedValue({ tables: [candidate], diagnostics: [] });
    await start(); button('help').click();
    const language = document.querySelector<HTMLSelectElement>('#language')!;
    language.value = 'en'; language.dispatchEvent(new Event('change')); await flush();
    expect(document.documentElement.lang).toBe('en');
    expect(button('copy').textContent).toBe('Copy to Excel');
    expect(text('selection-state')).toBe('Visible only');
    expect(text('table-warnings')).toContain('1 rows read; the page declares approximately 1,200.');
    expect(mocks.storageSet).toHaveBeenCalledWith({ uiLanguage: 'en' });
    expect(mocks.inspectActivePage).toHaveBeenCalledOnce();
    button('close-help').click(); button('copy').click();
    expect(button('confirm-export').textContent).toBe('Export these 1 rows');
    button('confirm-export').click(); await flush();
    expect(mocks.copyMatrix).toHaveBeenCalledExactlyOnceWith(candidate.rows);
  });

  it('traps risk-dialog focus, restores the triggering control and uses accessible text labels', async () => {
    mocks.inspectActivePage.mockResolvedValue({ tables: [withState('unknown')], diagnostics: [] });
    await start(); button('copy').focus(); button('copy').click();
    expect(document.activeElement).toBe(button('confirm-export'));
    button('cancel-export').focus();
    button('cancel-export').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(button('confirm-export'));
    button('confirm-export').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(button('cancel-export'));
    button('cancel-export').click(); expect(document.activeElement).toBe(button('copy'));
    expect(document.querySelector('#export-confirm')!.getAttribute('aria-describedby')).toBe('export-confirm-notice');
    expect(mocks.copyMatrix).not.toHaveBeenCalled();
  });

  it.each(['copy', 'export-csv'])('blocks %s when the visible preview is stale, then permits a fresh scan', async (id) => {
    await start(); mocks.validateActiveSnapshot.mockResolvedValue({ valid: false, reason: 'TABLE_CHANGED' });
    button(id).click(); await flush();
    expect(mocks.copyMatrix).not.toHaveBeenCalled(); expect(mocks.toCsv).not.toHaveBeenCalled(); expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(text('action-status')).toContain('网页已变化');
    expect(button('copy').disabled).toBe(true); expect(button('export-csv').disabled).toBe(true);
    button('rescan').click(); await flush(); mocks.validateActiveSnapshot.mockResolvedValue({ valid: true });
    button(id).click(); await flush();
    if (id === 'copy') expect(mocks.copyMatrix).toHaveBeenCalledExactlyOnceWith(table().rows);
    else expect(mocks.toCsv).toHaveBeenCalledExactlyOnceWith(table().rows);
  });

  it('reports business row and column counts on both successful export actions', async () => {
    await start(); button('copy').click(); await flush();
    expect(text('action-status')).toBe('已复制 1 行 × 2 列，请在 Excel 中粘贴。');
    button('export-csv').click(); await flush();
    expect(text('action-status')).toBe('CSV 已生成，1 行 × 2 列。');
  });

  it('shows measured collection progress and stops polling after cancellation', async () => {
    const completion = deferred<TableCandidateView>(); mocks.collectActiveTable.mockReturnValue(completion.promise);
    mocks.getActiveCollectionProgress.mockResolvedValue({ rows: 320, iterations: 5, running: true });
    await start(); selectSecond(); button('collect').click();
    await vi.advanceTimersByTimeAsync(400); await flush();
    expect(text('action-status')).toContain('已获取 320 行'); expect(text('action-status')).not.toContain('%');
    button('cancel-collect').click(); await flush(); const calls = mocks.getActiveCollectionProgress.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1200); expect(mocks.getActiveCollectionProgress).toHaveBeenCalledTimes(calls);
    completion.resolve({ ...table('table-2', false), metadata: { ...table('table-2', false).metadata, unsupported_reason: 'ABORTED' } }); await flush();
    expect(button('copy').disabled).toBe(true); expect(text('action-status')).toContain('已恢复页面滚动位置');
  });

  it('renders a bounded preview for a large wide snapshot without changing exported rows', async () => {
    const candidate = table(); candidate.title = '超长表格名称'.repeat(100);
    candidate.rows = Array.from({ length: 10002 }, (_, row) => Array.from({ length: 24 }, (_, column) => `${row}:${column}`));
    candidate.columns = 24; candidate.diagnostics.extractedRows = 10001; candidate.diagnostics.extractedColumns = 24;
    mocks.inspectActivePage.mockResolvedValue({ tables: [candidate], diagnostics: [] }); await start();
    expect(document.querySelectorAll('#matrix-preview tr')).toHaveLength(5);
    expect(document.querySelectorAll('#matrix-preview td')).toHaveLength(40);
    expect(text('selection-summary')).toBe('10,001 行 × 24 列');
    button('export-csv').click(); await flush(); expect(mocks.toCsv).toHaveBeenCalledExactlyOnceWith(candidate.rows);
  });

  it.each(['empty', 'loading', 'restricted', 'failed'] as const)('distinguishes the %s empty-page state', async (state) => {
    const loading = table(); loading.rows = []; loading.diagnostics.extractedRows = 0;
    loading.diagnostics.warnings = [{ code: 'LOADING' }]; loading.metadata.loading = true;
    mocks.inspectActivePage.mockResolvedValue({ tables: state === 'loading' ? [loading] : [], diagnostics:
      state === 'restricted' ? [{ code: 'CROSS_ORIGIN_FRAME_PERMISSION', unsupported_reason: 'CROSS_ORIGIN_FRAME_PERMISSION', certainty: 'confirmed', message: 'private internal detail' }]
        : state === 'failed' ? [{ code: 'MALFORMED_STRUCTURE', unsupported_reason: 'MALFORMED_STRUCTURE', certainty: 'confirmed', message: 'private internal detail' }] : [] });
    await start(); expect(document.querySelector('#status')!.getAttribute('data-state')).toBe(state);
    const expected = { empty: '没有找到数据表', loading: '页面仍在加载表格', restricted: '部分内嵌页面无法读取', failed: '找到了表格结构' }[state];
    expect(text('status')).toContain(expected); expect(text('status')).not.toContain('private internal detail');
    expect(button('copy').disabled).toBe(true); expect(button('export-csv').disabled).toBe(true);
  });

  it('copies the same sanitized report JSON that can be downloaded, through an explicit Help action', async () => {
    mocks.generateActiveDebugReport.mockResolvedValue(debugData());
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      await start(); button('help').click(); button('copy-report').click(); await flush();
      expect(writeText).toHaveBeenCalledExactlyOnceWith(JSON.stringify(debugData(), null, 2));
      expect(text('report-status')).toContain('不包含表格业务内容');
      expect(mocks.copyMatrix).not.toHaveBeenCalled(); expect(mocks.createObjectURL).not.toHaveBeenCalled();
    } finally { Reflect.deleteProperty(navigator, 'clipboard'); }
  });
});
