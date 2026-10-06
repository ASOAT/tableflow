import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanActivePage } from '../src/popup/scan-page';
import type { ExtractedTable } from '../src/shared/table';

afterEach(() => vi.unstubAllGlobals());

describe('scanActivePage', () => {
  it('returns a table snapshot using a self-contained function in the same document', async () => {
    const tables: ExtractedTable[] = [{
      id: 1, rowCount: 1, columnCount: 2, preview: '名称 | 中文', matrix: [['名称', '中文']],
    }];
    const targets: unknown[] = [];
    const snapshot = { tables, inaccessibleFrameCount: 0 };
    vi.stubGlobal('chrome', {
      tabs: { query: async () => [{ id: 12, url: 'https://example.com/' }] },
      scripting: {
        executeScript: async (injection: { files?: string[]; func?: () => unknown; target: unknown; args?: unknown[] }) => {
          targets.push(injection.target);
          if (injection.files) return [{ frameId: 0, documentId: 'original-document' }];
          // Recreate the function without its module closure, as Chromium does.
          const result = runInNewContext(`(${injection.func!.toString()})(...args)`, {
            TableFlowScanner: { scanTables: () => snapshot }, args: injection.args ?? [],
          });
          return [{ frameId: 0, documentId: 'original-document', result }];
        },
      },
    });
    await expect(scanActivePage()).resolves.toEqual(snapshot);
    expect(targets).toEqual([
      { tabId: 12, frameIds: [0] },
      { tabId: 12, documentIds: ['original-document'] },
    ]);
  });

  it('returns an empty snapshot when the page has no table', async () => {
    const executeScript = vi.fn()
      .mockResolvedValueOnce([{ documentId: 'empty-document' }])
      .mockResolvedValueOnce([{ result: { tables: [], inaccessibleFrameCount: 0 } }]);
    vi.stubGlobal('chrome', { tabs: { query: async () => [{ id: 1 }] }, scripting: { executeScript } });
    await expect(scanActivePage()).resolves.toEqual({ tables: [], inaccessibleFrameCount: 0 });
  });

  it('explains restricted browser pages without trying to inject', async () => {
    const executeScript = vi.fn();
    vi.stubGlobal('chrome', {
      tabs: { query: async () => [{ id: 1, url: 'edge://extensions/' }] },
      scripting: { executeScript },
    });
    await expect(scanActivePage()).rejects.toThrow('浏览器内部页面无法扫描');
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('explains an unavailable active tab', async () => {
    vi.stubGlobal('chrome', { tabs: { query: async () => [] } });
    await expect(scanActivePage()).rejects.toThrow('没有找到当前标签页');
  });

  it('shows a friendly error when permissions or navigation prevent injection', async () => {
    vi.stubGlobal('chrome', {
      tabs: { query: async () => [{ id: 1 }] },
      scripting: { executeScript: async () => { throw new Error('Cannot access contents'); } },
    });
    await expect(scanActivePage()).rejects.toThrow('无法读取此页面');
  });
});
