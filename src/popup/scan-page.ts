import type { ScanOptions, ScanResult } from '../shared/table';
import type { EngineOptions, EngineSnapshot, TableCandidateView } from '../shared/engine';
import type { VirtualLimits } from '../extractors/virtualized/config';
import type { DebugReport } from '../shared/debug-report';
import { t } from '../shared/i18n';

type PopupErrorCode = 'ACCESS_DENIED' | 'NO_TAB' | 'INTERNAL_PAGE' | 'PAGE_CHANGED' | 'SCAN_FAILED' | 'REPORT_FAILED' | 'PERMISSION_DENIED' | 'SYNC_FAILED';
export class PopupError extends Error {
  constructor(readonly code: PopupErrorCode) { super(popupErrorText({ code })); }
}
export function popupErrorText(error: unknown, fallback: 'scanFailed' | 'collectFailed' | 'settingFailed' = 'scanFailed'): string {
  const code = typeof error === 'object' && error ? (error as { code?: string }).code : undefined;
  const key = ({ ACCESS_DENIED: 'scanDenied', NO_TAB: 'noTab', INTERNAL_PAGE: 'internalPage', PAGE_CHANGED: 'changed', SCAN_FAILED: 'scanFailed', REPORT_FAILED: 'reportFailed', PERMISSION_DENIED: 'permissionDenied', SYNC_FAILED: 'syncFailed' } as const)[code as PopupErrorCode];
  if (key) return t(key);
  if (error instanceof Error && /网页已变化|PAGE_CHANGED|STALE_SNAPSHOT|TABLE_CHANGED|TABLE_REMOVED/.test(error.message)) return t('changed');
  return t(fallback);
}
export interface SnapshotValidation { valid: boolean; reason?: string; }
export interface CollectionProgress { rows: number; iterations: number; running: boolean; }

interface ScannerGlobal {
  TableFlowScanner?: {
    scanTables(options?: ScanOptions): ScanResult;
    setTableIcons(enabled: boolean): void;
    inspectTables(options?: EngineOptions): EngineSnapshot;
    collectTable(id: string, limits?: Partial<VirtualLimits>): Promise<TableCandidateView>;
    cancelCollection(): void;
    generateDebugReport(id: string): DebugReport;
    validateSnapshot(snapshotId: string, id: string): SnapshotValidation;
    getCollectionProgress(): CollectionProgress;
  };
}

let inspectedTarget: chrome.scripting.InjectionTarget | undefined;
let collectionTarget: chrome.scripting.InjectionTarget | undefined;

export async function inspectActivePage(options: EngineOptions = {}): Promise<EngineSnapshot> {
  const tab = await getActivePage();
  inspectedTarget = undefined;
  try {
    const target = await injectScanner(tab);
    const [result] = await chrome.scripting.executeScript({
      target, world: 'ISOLATED', args: [options],
      func: (engineOptions: EngineOptions) => {
        const scanner = (globalThis as typeof globalThis & ScannerGlobal).TableFlowScanner;
        if (!scanner) throw new Error('表格扫描器未能加载。');
        return scanner.inspectTables(engineOptions);
      },
    });
    if (!Array.isArray(result?.result?.tables) || !Array.isArray(result.result.diagnostics)) {
      throw new Error('扫描没有返回有效数据。');
    }
    inspectedTarget = target;
    return result.result;
  } catch {
    throw new PopupError('ACCESS_DENIED');
  }
}

export async function collectActiveTable(id: string, limits?: Partial<VirtualLimits>): Promise<TableCandidateView> {
  const tab = await getActivePage();
  if (!inspectedTarget || inspectedTarget.tabId !== tab.id) throw new PopupError('PAGE_CHANGED');
  const target = await injectScanner(tab);
  if (target.documentIds?.[0] !== inspectedTarget.documentIds?.[0]) {
    inspectedTarget = undefined;
    throw new PopupError('PAGE_CHANGED');
  }
  collectionTarget = target;
  try {
    const [result] = await chrome.scripting.executeScript({
      target, world: 'ISOLATED', args: [id, limits ?? {}],
      func: (tableId: string, collectionLimits: Partial<VirtualLimits>) => {
        const scanner = (globalThis as typeof globalThis & ScannerGlobal).TableFlowScanner;
        if (!scanner) throw new Error('表格扫描器未能加载。');
        return scanner.collectTable(tableId, collectionLimits);
      },
    });
    if (!result?.result || result.result.id !== id || !Array.isArray(result.result.rows)) {
      throw new Error('无法完成收集。网页可能已变化，请重新扫描。');
    }
    return result.result;
  } finally { if (collectionTarget === target) collectionTarget = undefined; }
}

export async function cancelActiveCollection(): Promise<void> {
  const target = collectionTarget;
  if (!target) return;
  await chrome.scripting.executeScript({
    target, world: 'ISOLATED',
    func: () => {
      const scanner = (globalThis as typeof globalThis & ScannerGlobal).TableFlowScanner;
      scanner?.cancelCollection();
    },
  });
}

/** Uses the already pinned collection document; polling neither injects nor scans. */
export async function getActiveCollectionProgress(): Promise<CollectionProgress | undefined> {
  if (!collectionTarget) return undefined;
  const [result] = await chrome.scripting.executeScript({
    target: collectionTarget, world: 'ISOLATED',
    func: () => (globalThis as typeof globalThis & ScannerGlobal).TableFlowScanner?.getCollectionProgress(),
  });
  const progress = result?.result;
  return progress && Number.isFinite(progress.rows) && typeof progress.running === 'boolean' ? progress : undefined;
}

/** Validation never replaces the preview with a freshly extracted matrix. */
export async function validateActiveSnapshot(table: TableCandidateView): Promise<SnapshotValidation> {
  if (!table.snapshotId || !inspectedTarget) return { valid: false, reason: 'STALE_SNAPSHOT' };
  try {
    const tab = await getActivePage();
    if (tab.id !== inspectedTarget.tabId) return { valid: false, reason: 'PAGE_CHANGED' };
    const [result] = await chrome.scripting.executeScript({
      target: inspectedTarget, world: 'ISOLATED', args: [table.snapshotId, table.id],
      func: (token: string, id: string) => (globalThis as typeof globalThis & ScannerGlobal).TableFlowScanner?.validateSnapshot(token, id),
    });
    return typeof result?.result?.valid === 'boolean' ? result.result : { valid: false, reason: 'STALE_SNAPSHOT' };
  } catch { return { valid: false, reason: 'PAGE_CHANGED' }; }
}

export async function generateActiveDebugReport(id: string): Promise<DebugReport> {
  const tab = await getActivePage();
  if (!inspectedTarget || inspectedTarget.tabId !== tab.id) throw new PopupError('PAGE_CHANGED');
  const target = await injectScanner(tab);
  if (target.documentIds?.[0] !== inspectedTarget.documentIds?.[0]) throw new PopupError('PAGE_CHANGED');
  const [result] = await chrome.scripting.executeScript({
    target, world: 'ISOLATED', args: [id],
    func: (tableId: string) => {
      const scanner = (globalThis as typeof globalThis & ScannerGlobal).TableFlowScanner;
      if (!scanner) throw new Error('表格扫描器未能加载。');
      return scanner.generateDebugReport(tableId);
    },
  });
  if (!result?.result || typeof result.result !== 'object') throw new PopupError('REPORT_FAILED');
  return result.result;
}

export async function getActivePage(): Promise<chrome.tabs.Tab> {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    throw new PopupError('NO_TAB');
  }

  // The same popup may be opened as an extension tab for local acceptance.
  // Only our exact popup can retain the previously inspected business tab;
  // switching to any other page still invalidates the export target.
  if (inspectedTarget && (!tab.url || tab.url.startsWith('chrome-extension:'))) {
    const popupPath = chrome.runtime.getManifest().action?.default_popup;
    if (popupPath) {
      const popupUrl = new URL(chrome.runtime.getURL(popupPath));
      // Without the tabs permission, even our extension tab's URL can be absent.
      // getCurrent identifies the caller's own tab, never a different website.
      const ownTab = !tab.url ? await chrome.tabs.getCurrent() : undefined;
      const callerUrl = ownTab?.id === tab.id ? globalThis.location.href : tab.url;
      const activeUrl = callerUrl ? new URL(callerUrl) : undefined;
      if (activeUrl && activeUrl.protocol === popupUrl.protocol && activeUrl.host === popupUrl.host && activeUrl.pathname === popupUrl.pathname) {
        tab = await chrome.tabs.get(inspectedTarget.tabId!);
      }
    }
  }
  if (tab.url && /^(edge|chrome|about|devtools|chrome-extension):/i.test(tab.url)) {
    throw new PopupError('INTERNAL_PAGE');
  }

  return tab;
}

async function injectScanner(tab: chrome.tabs.Tab): Promise<chrome.scripting.InjectionTarget> {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id!, frameIds: [0] }, world: 'ISOLATED', files: ['content.js'],
  });
  if (!injection?.documentId) throw new Error('无法定位当前网页。');
  return { tabId: tab.id!, documentIds: [injection.documentId] };
}

export async function scanActivePage(options: ScanOptions = {}): Promise<ScanResult> {
  const tab = await getActivePage();
  try {
    const target = await injectScanner(tab);

    // Pin the second call to the same document in case the page navigates.
    // The injected function must be self-contained: only DOM/global access here.
    const [result] = await chrome.scripting.executeScript({
      target,
      world: 'ISOLATED',
      args: [options],
      func: (scanOptions: ScanOptions) => {
        const scanner = (globalThis as typeof globalThis & ScannerGlobal).TableFlowScanner;
        if (!scanner) throw new Error('表格扫描器未能加载。');
        return scanner.scanTables(scanOptions);
      },
    });
    if (!Array.isArray(result?.result?.tables)) {
      throw new Error('扫描没有返回表格数据。');
    }
    return result.result;
  } catch {
    throw new PopupError('ACCESS_DENIED');
  }
}

export async function applyTableIconsToActivePage(enabled: boolean): Promise<void> {
  const tab = await getActivePage();
  const target = await injectScanner(tab);
  await chrome.scripting.executeScript({
    target, world: 'ISOLATED', args: [enabled],
    func: (show: boolean) => {
      const scanner = (globalThis as typeof globalThis & ScannerGlobal).TableFlowScanner;
      if (!scanner) throw new Error('表格扫描器未能加载。');
      scanner.setTableIcons(show);
    },
  });
}
