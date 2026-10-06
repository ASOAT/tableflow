import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTableIcons } from '../src/content/overlay';
import { AUTO_ICON_SITES_KEY, sitePattern } from '../src/shared/site-settings';
import { walkAccessibleRoots } from '../src/extractors/domWalker';
import type { TableCandidate } from '../src/extractors/types';

const mocks = vi.hoisted(() => ({ discover: vi.fn(), copy: vi.fn() }));
vi.mock('../src/extractors', () => ({ extractTables: mocks.discover }));
vi.mock('../src/exporters/clipboard', () => ({ copyMatrix: mocks.copy }));

type StorageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => void;
let storageListeners: Set<StorageListener>;
const resizeObservers: FakeResizeObserver[] = [];
class FakeResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) { resizeObservers.push(this); }
}

function rect(left = 40, top = 50, width = 300, height = 120): DOMRect {
  return new DOMRect(left, top, width, height);
}

function addTable(doc = document, text = '数据'): HTMLTableElement {
  const table = doc.createElement('table');
  const row = table.insertRow();
  row.insertCell().textContent = text;
  doc.body.append(table);
  vi.spyOn(table, 'getBoundingClientRect').mockReturnValue(rect());
  return table;
}

function icons(doc = document): HTMLButtonElement[] {
  return Array.from(doc.querySelector(`[data-tableflow-overlay]`)?.shadowRoot?.querySelectorAll('button') ?? []);
}

async function refreshMutations(): Promise<void> {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(150);
}

function candidate(sourceElement: Element, rows = [['数据']], title?: string, complete = true): TableCandidate {
  return { id: 'test', type: sourceElement.tagName === 'TABLE' ? 'native-table' : 'aria-grid', confidence: 0.95,
    sourceElement, rows, columns: rows[0]?.length ?? 0, ...(title ? { title } : {}),
    metadata: { headerRows: 0, complete, ...(complete ? {} : { warnings: ['仍有未渲染的行。'] }) } };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  storageListeners = new Set();
  resizeObservers.length = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('chrome', {
    storage: { onChanged: {
      addListener: (listener: StorageListener) => storageListeners.add(listener),
      removeListener: (listener: StorageListener) => storageListeners.delete(listener),
    } },
  });
  mocks.copy.mockReset().mockResolvedValue(undefined);
  mocks.discover.mockReset().mockImplementation((root: Document) => {
    const roots = walkAccessibleRoots(root).roots;
    return {
      tables: roots.flatMap(({ root }) => Array.from(root.querySelectorAll('table'))
        .filter((table) => !table.hasAttribute('data-layout'))
        .map((table) => candidate(table, [[table.rows[0]?.cells[0]?.textContent ?? '']], '数据表格'))),
      diagnostics: [],
    };
  });
});

afterEach(() => {
  setTableIcons(false);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('page table copy icons', () => {
  it('uses one scoped layer for data tables and reuses it on repeated injections', () => {
    const table = addTable();
    addTable(document, '排版').setAttribute('data-layout', '');
    setTableIcons(true);
    setTableIcons(true);
    expect(document.querySelectorAll('[data-tableflow-overlay]')).toHaveLength(1);
    expect(icons()).toHaveLength(1);
    expect(table.querySelector('button')).toBeNull();
    expect(icons()[0]?.getAttribute('aria-label')).toContain('复制到 Excel');
    expect(icons()[0]?.style.left).toBe('308px');
    expect(icons()[0]?.style.top).toBe('54px');
    expect(mocks.discover).toHaveBeenCalledWith(document, { includeLowConfidence: false });
    expect(storageListeners.size).toBe(1);
    setTableIcons(false);
    setTableIcons(false);
    expect(document.querySelector('[data-tableflow-overlay]')).toBeNull();
    expect(storageListeners.size).toBe(0);
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps the icon inside the visible table area during container scroll and resize', async () => {
    const container = document.createElement('div');
    container.style.overflowX = 'auto';
    container.style.overflowY = 'auto';
    document.body.append(container);
    const table = addTable();
    container.append(table);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(20, 30, 180, 170));
    const geometry = vi.mocked(table.getBoundingClientRect);
    geometry.mockReturnValue(rect(10, 40, 700, 400));
    setTableIcons(true);
    expect(icons()[0]?.style.left).toBe('168px');
    geometry.mockReturnValue(rect(-100, -80, 700, 400));
    container.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(20);
    expect(icons()[0]?.style.left).toBe('168px');
    expect(icons()[0]?.style.top).toBe('34px');
    geometry.mockReturnValue(rect(210, 50, 300, 120));
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(20);
    expect(icons()[0]?.hidden).toBe(true);
  });

  it('hides offscreen tables and updates positions when table sizes change', async () => {
    const table = addTable();
    setTableIcons(true);
    vi.mocked(table.getBoundingClientRect).mockReturnValue(rect(40, 50, 500, 120));
    resizeObservers[0]?.callback([], resizeObservers[0] as unknown as ResizeObserver);
    await vi.advanceTimersByTimeAsync(20);
    expect(icons()[0]?.style.left).toBe('508px');
    vi.mocked(table.getBoundingClientRect).mockReturnValue(rect(40, window.innerHeight + 1, 300, 120));
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(20);
    expect(icons()[0]?.hidden).toBe(true);
  });

  it.each([
    ['datagrid-view', 'EasyUI 表格'],
    ['ui-jqgrid-view', 'jqGrid 表格'],
    ['ui-jqgrid', 'jqGrid 表格'],
  ])('anchors combined %s to its wrapper header and keeps ordinary table geometry', async (className, label) => {
    const grid = document.createElement('div');
    grid.className = className;
    document.body.append(grid);
    const body = document.createElement('div');
    body.style.overflowY = 'auto';
    grid.append(body);
    const table = addTable();
    body.append(table);
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(rect(20, 30, 500, 300));
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(rect(20, 90, 500, 240));
    vi.mocked(table.getBoundingClientRect).mockReturnValue(rect(20, 90, 500, 600));
    mocks.discover.mockReturnValue({
      tables: [candidate(table, [['数据']], label)], diagnostics: [],
    });
    setTableIcons(true);
    expect(icons()[0]?.style.left).toBe('488px');
    expect(icons()[0]?.style.top).toBe('34px');
    expect(resizeObservers[0]?.observe).toHaveBeenCalledWith(grid);
    vi.mocked(table.getBoundingClientRect).mockReturnValue(rect(20, -80, 500, 600));
    body.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(20);
    expect(icons()[0]?.style.top).toBe('34px');

    mocks.discover.mockReturnValue({
      tables: [candidate(table)], diagnostics: [],
    });
    vi.mocked(table.getBoundingClientRect).mockReturnValue(rect(20, 90, 500, 600));
    setTableIcons(true);
    expect(icons()[0]?.style.top).toBe('94px');
    expect(resizeObservers[0]?.unobserve).toHaveBeenCalledWith(grid);
    mocks.discover.mockReturnValue({ tables: [], diagnostics: [] });
    setTableIcons(true);
    expect(resizeObservers[0]?.unobserve).toHaveBeenCalledWith(table);
  });

  it('refreshes AJAX tables without reacting indefinitely to its own layer', async () => {
    const first = addTable();
    setTableIcons(true);
    addTable(document, '异步数据');
    await refreshMutations();
    expect(icons()).toHaveLength(2);
    const calls = mocks.discover.mock.calls.length;
    await refreshMutations();
    expect(mocks.discover.mock.calls.length).toBe(calls);
    first.remove();
    await refreshMutations();
    expect(icons()).toHaveLength(1);
    setTableIcons(false);
    const stoppedCalls = mocks.discover.mock.calls.length;
    addTable(document, '关闭后');
    window.dispatchEvent(new Event('resize'));
    await refreshMutations();
    expect(mocks.discover.mock.calls.length).toBe(stoppedCalls);
    expect(document.querySelector('[data-tableflow-overlay]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('copies the latest matrix directly from the click and safely shows feedback', async () => {
    const table = addTable(document, '旧内容');
    setTableIcons(true);
    table.rows[0]!.cells[0]!.textContent = '<img onerror=alert(1)>最新';
    icons()[0]!.click();
    expect(mocks.copy).toHaveBeenCalledWith([['<img onerror=alert(1)>最新']], document);
    await Promise.resolve();
    expect(icons()[0]?.dataset.state).toBe('success');
    expect(icons()[0]?.title).toContain('已复制');
    expect(document.querySelector('[data-tableflow-overlay]')?.shadowRoot?.querySelector('img')).toBeNull();
    await vi.advanceTimersByTimeAsync(2050);
    expect(icons()[0]?.dataset.state).toBeUndefined();
  });

  it('gives useful clipboard failure feedback and clears timers when disabled', async () => {
    addTable();
    mocks.copy.mockRejectedValue(new Error('Clipboard unavailable'));
    setTableIcons(true);
    icons()[0]!.click();
    await Promise.resolve();
    expect(icons()[0]?.dataset.state).toBe('error');
    expect(icons()[0]?.title).toContain('扩展面板');
    setTableIcons(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('watches initially empty same-origin frames and cleans every document on disable', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const child = frame.contentDocument!;
    setTableIcons(true);
    expect(child.querySelector('[data-tableflow-overlay]')).not.toBeNull();
    addTable(child, '框架数据');
    await refreshMutations();
    expect(icons(child)).toHaveLength(1);
    icons(child)[0]!.click();
    expect(mocks.copy).toHaveBeenCalledWith([['框架数据']], child);
    setTableIcons(false);
    expect(document.querySelector('[data-tableflow-overlay]')).toBeNull();
    expect(child.querySelector('[data-tableflow-overlay]')).toBeNull();
  });

  it('attaches watchers to new frames after frame load', async () => {
    setTableIcons(true);
    const frame = document.createElement('iframe');
    document.body.append(frame);
    addTable(frame.contentDocument!, '新框架');
    frame.dispatchEvent(new Event('load'));
    await refreshMutations();
    expect(icons(frame.contentDocument!)).toHaveLength(1);
    expect(document.querySelectorAll('[data-tableflow-overlay]')).toHaveLength(1);
  });

  it('disables immediately when this website is removed from saved preferences', () => {
    addTable();
    setTableIcons(true);
    const listener = [...storageListeners][0]!;
    listener({ [AUTO_ICON_SITES_KEY]: { newValue: [sitePattern(document.URL)] } }, 'local');
    expect(icons()).toHaveLength(1);
    listener({ [AUTO_ICON_SITES_KEY]: { newValue: [] } }, 'local');
    expect(document.querySelector('[data-tableflow-overlay]')).toBeNull();
    expect(storageListeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports generic ARIA element anchors and prevents copying incomplete data', () => {
    const grid = document.createElement('div');
    grid.setAttribute('role', 'grid');
    document.body.append(grid);
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(rect());
    mocks.discover.mockReturnValue({ tables: [candidate(grid, [['已渲染']], undefined, false)], diagnostics: [] });
    setTableIcons(true);
    expect(icons()[0]?.disabled).toBe(true);
    expect(icons()[0]?.title).toContain('未渲染');
    icons()[0]!.click();
    expect(mocks.copy).not.toHaveBeenCalled();
    mocks.discover.mockReturnValue({ tables: [candidate(grid, [['全部数据']])], diagnostics: [] });
    setTableIcons(true);
    expect(icons()[0]?.disabled).toBe(false);
    icons()[0]!.click();
    expect(mocks.copy).toHaveBeenCalledWith([['全部数据']], document);
  });

  it('rechecks completeness at click time before touching the clipboard', () => {
    const table = addTable();
    setTableIcons(true);
    mocks.discover.mockReturnValue({ tables: [candidate(table, [['部分']], undefined, false)], diagnostics: [] });
    icons()[0]!.click();
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(icons()[0]?.disabled).toBe(true);
  });

  it('observes initially empty open shadow roots and cleans their watchers on disable', async () => {
    const host = document.createElement('custom-grid');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    setTableIcons(true);
    expect(icons()).toHaveLength(0);
    const table = addTable();
    shadow.append(table);
    await refreshMutations();
    expect(icons()).toHaveLength(1);
    const calls = mocks.discover.mock.calls.length;
    await refreshMutations();
    expect(mocks.discover.mock.calls.length).toBe(calls);
    table.rows[0]!.cells[0]!.textContent = 'Shadow 数据';
    await refreshMutations();
    icons()[0]!.click();
    expect(mocks.copy).toHaveBeenCalledWith([['Shadow 数据']], document);
    setTableIcons(false);
    const stopped = mocks.discover.mock.calls.length;
    table.rows[0]!.cells[0]!.textContent = '关闭后';
    await refreshMutations();
    expect(mocks.discover.mock.calls.length).toBe(stopped);
    expect(vi.getTimerCount()).toBe(0);
  });
});
