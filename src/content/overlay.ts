import { extractTables } from '../extractors';
import { walkAccessibleRoots } from '../extractors/domWalker';
import type { TableCandidate } from '../extractors/types';
import { copyMatrix } from '../exporters/clipboard';
import { AUTO_ICON_SITES_KEY, readEnabledSites, sitePattern } from '../shared/site-settings';

const hostAttribute = 'data-tableflow-overlay';
type Candidate = TableCandidate;
interface IconEntry { candidate: Candidate; geometryTarget: Element; button: HTMLButtonElement; feedbackTimer?: number }
interface Layer {
  host: HTMLElement;
  shadow: ShadowRoot;
  mutationObserver?: MutationObserver;
  resizeObserver?: ResizeObserver;
  cleanup(): void;
}
interface IconController { refresh(): void; dispose(): void }
const controllerGlobal = globalThis as typeof globalThis & { __TableFlowIconController?: IconController };

function safeDirectCopy(candidate: Candidate): boolean {
  if (['MALFORMED_STRUCTURE', 'ABORTED'].includes(candidate.metadata.unsupported_reason ?? '')) return false;
  const state = candidate.diagnostics?.completeness;
  return state === undefined ? candidate.metadata.complete : state === 'complete' || state === 'current-page';
}

function geometryTarget(candidate: Candidate): Element {
  return candidate.title && /EasyUI|jqGrid/.test(candidate.title)
    ? candidate.sourceElement.closest('.datagrid-view, .ui-jqgrid-view, .ui-jqgrid') ?? candidate.sourceElement
    : candidate.sourceElement;
}

function composedParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root.nodeType === 11 && 'host' in root ? (root as ShadowRoot).host : null;
}

function ownMutation(record: MutationRecord): boolean {
  const element = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
  if (element?.closest(`[${hostAttribute}]`)) return true;
  const root = element?.getRootNode();
  if (root?.nodeType === 11 && 'host' in root && (root as ShadowRoot).host.hasAttribute(hostAttribute)) return true;
  const changed = [...record.addedNodes, ...record.removedNodes];
  return record.type === 'childList' && changed.length > 0
    && changed.every((node) => node.nodeType === 1 && (node as Element).hasAttribute(hostAttribute));
}

class TableIconController implements IconController {
  private readonly layers = new Map<Document, Layer>();
  private readonly shadowWatchers = new Map<ShadowRoot, () => void>();
  private readonly entries = new Map<Element, IconEntry>();
  private readonly view = document.defaultView!;
  private readonly useRaf = typeof this.view.requestAnimationFrame === 'function';
  private refreshTimer?: number;
  private positionTimer?: number;
  private disposed = false;
  private readonly storageChanges = typeof chrome !== 'undefined' ? chrome.storage?.onChanged : undefined;

  constructor(private readonly root: Document) {
    this.storageChanges?.addListener(this.onStorageChange);
  }

  private readonly onStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string): void => {
    if (area !== 'local' || !changes[AUTO_ICON_SITES_KEY]) return;
    const pattern = sitePattern(this.root.URL);
    if (!pattern || !readEnabledSites(changes[AUTO_ICON_SITES_KEY]?.newValue).includes(pattern)) {
      setTableIcons(false);
    }
  };

  private readonly scheduleRefresh = (): void => {
    if (this.disposed || this.refreshTimer !== undefined) return;
    this.refreshTimer = this.view.setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, 120);
  };

  private readonly schedulePosition = (): void => {
    if (this.disposed || this.positionTimer !== undefined) return;
    const update = () => { this.positionTimer = undefined; this.position(); };
    this.positionTimer = this.useRaf
      ? this.view.requestAnimationFrame(update)
      : this.view.setTimeout(update, 16);
  };

  private readonly onLoad = (event: Event): void => {
    const tag = (event.target as Element | null)?.tagName;
    if (tag === 'IFRAME' || tag === 'FRAME') this.scheduleRefresh();
    else this.schedulePosition();
  };

  private createLayer(doc: Document): Layer {
    const view = doc.defaultView;
    const host = doc.createElement('div');
    host.setAttribute(hostAttribute, '');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = `
      button{all:unset;box-sizing:border-box;position:absolute;display:grid;place-items:center;
        width:28px;height:28px;border:1px solid #b7d1db;border-radius:6px;background:#fff;
        color:#155c68;font:18px/1 "Segoe UI",sans-serif;cursor:pointer;pointer-events:auto;
        box-shadow:0 1px 5px #0002}
      button[hidden]{display:none}button:hover{background:#e7f5f5}button:disabled{opacity:.55;cursor:not-allowed}
      button:focus-visible{outline:2px solid #147b85;outline-offset:2px}
      button::after{content:attr(data-tooltip);position:absolute;right:0;top:33px;white-space:nowrap;
        padding:5px 8px;border-radius:4px;background:#18323a;color:white;font:12px/1.5 sans-serif;
        opacity:0;pointer-events:none}button:hover::after,button:focus-visible::after{opacity:1}
      button[data-state=success]{background:#e6f4e8}button[data-state=error]{background:#fff0e9}
    `;
    shadow.append(style);
    doc.documentElement.append(host);
    const mutationObserver = view ? new view.MutationObserver((records) => {
      if (!records.every(ownMutation)) this.scheduleRefresh();
    }) : undefined;
    mutationObserver?.observe(doc.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'colspan', 'rowspan', 'role',
        'aria-rowcount', 'aria-colcount', 'aria-rowindex', 'aria-colindex', 'aria-colspan', 'aria-rowspan', 'data-row-key'],
    });
    const resizeObserver = view?.ResizeObserver ? new view.ResizeObserver(this.schedulePosition) : undefined;
    resizeObserver?.observe(doc.documentElement);
    doc.addEventListener('scroll', this.schedulePosition, true);
    doc.addEventListener('load', this.onLoad, true);
    view?.addEventListener('resize', this.schedulePosition);
    return {
      host, shadow, mutationObserver, resizeObserver,
      cleanup: () => {
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        doc.removeEventListener('scroll', this.schedulePosition, true);
        doc.removeEventListener('load', this.onLoad, true);
        view?.removeEventListener('resize', this.schedulePosition);
        host.remove();
      },
    };
  }

  refresh(): void {
    if (this.disposed) return;
    if (this.refreshTimer !== undefined) this.view.clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    const { tables: candidates } = extractTables(this.root, { includeLowConfidence: false });
    const accessible = walkAccessibleRoots(this.root).roots
      .filter(({ root }) => root.nodeType !== 11 || !(root as ShadowRoot).host.hasAttribute(hostAttribute));
    const documents = new Set(accessible.map(({ root }) => root.nodeType === 9 ? root as Document : root.ownerDocument!));
    const shadows = new Set(accessible.filter(({ root }) => root.nodeType === 11).map(({ root }) => root as ShadowRoot));
    const anchors = new Set(candidates.map((candidate) => candidate.sourceElement));
    for (const [anchor, entry] of this.entries) {
      if (!anchors.has(anchor)) {
        if (entry.feedbackTimer !== undefined) this.view.clearTimeout(entry.feedbackTimer);
        const observer = this.layers.get(anchor.ownerDocument)?.resizeObserver;
        observer?.unobserve(anchor);
        if (entry.geometryTarget !== anchor) observer?.unobserve(entry.geometryTarget);
        entry.button.remove();
        this.entries.delete(anchor);
      }
    }
    for (const [doc, layer] of this.layers) {
      if (!documents.has(doc)) { layer.cleanup(); this.layers.delete(doc); }
    }
    for (const doc of documents) {
      if (!this.layers.has(doc)) this.layers.set(doc, this.createLayer(doc));
    }
    for (const [shadow, cleanup] of this.shadowWatchers) {
      if (!shadows.has(shadow)) { cleanup(); this.shadowWatchers.delete(shadow); }
    }
    for (const shadow of shadows) {
      if (this.shadowWatchers.has(shadow)) continue;
      const view = shadow.ownerDocument.defaultView;
      const observer = view ? new view.MutationObserver((records) => {
        if (!records.every(ownMutation)) this.scheduleRefresh();
      }) : undefined;
      observer?.observe(shadow, { childList: true, subtree: true, characterData: true, attributes: true });
      shadow.addEventListener('scroll', this.schedulePosition, true);
      shadow.addEventListener('load', this.onLoad, true);
      this.shadowWatchers.set(shadow, () => {
        observer?.disconnect();
        shadow.removeEventListener('scroll', this.schedulePosition, true);
        shadow.removeEventListener('load', this.onLoad, true);
      });
    }
    for (const candidate of candidates) {
      const anchor = candidate.sourceElement;
      const existing = this.entries.get(anchor);
      const target = geometryTarget(candidate);
      if (existing) {
        if (existing.geometryTarget !== target) {
          const observer = this.layers.get(anchor.ownerDocument)?.resizeObserver;
          if (existing.geometryTarget !== anchor) observer?.unobserve(existing.geometryTarget);
          if (target !== anchor) observer?.observe(target);
          existing.geometryTarget = target;
        }
        existing.candidate = candidate;
        this.updateAvailability(existing);
        continue;
      }
      const layer = this.layers.get(anchor.ownerDocument);
      if (!layer) continue;
      const button = anchor.ownerDocument.createElement('button');
      button.type = 'button';
      button.textContent = '⧉';
      button.title = '复制到 Excel';
      button.dataset.tooltip = '复制到 Excel';
      button.setAttribute('aria-label', `复制到 Excel${candidate.title ? `：${candidate.title}` : ''}`);
      const entry: IconEntry = { candidate, geometryTarget: target, button };
      this.updateAvailability(entry);
      button.addEventListener('click', () => this.copy(entry));
      layer.shadow.append(button);
      layer.resizeObserver?.observe(anchor);
      if (target !== anchor) layer.resizeObserver?.observe(target);
      this.entries.set(anchor, entry);
    }
    this.position();
  }

  private updateAvailability(entry: IconEntry): void {
    const incomplete = !safeDirectCopy(entry.candidate);
    entry.button.disabled = incomplete;
    entry.button.title = entry.button.dataset.tooltip = incomplete
      ? `${entry.candidate.metadata.warnings?.[0] ?? '此表格只包含部分已渲染数据。'} 请在扩展面板中查看。`
      : entry.candidate.diagnostics?.completeness === 'current-page'
        ? `复制当前页 ${entry.candidate.diagnostics.extractedRows} 行到 Excel` : '复制到 Excel';
  }

  private copy(entry: IconEntry): void {
    if (this.disposed) return;
    // Read the latest DOM synchronously and invoke Clipboard while the click is active.
    const latest = extractTables(this.root, { includeLowConfidence: false }).tables
      .find((candidate) => candidate.sourceElement === entry.candidate.sourceElement);
    if (!latest) { this.feedback(entry, false); this.scheduleRefresh(); return; }
    entry.candidate = latest;
    if (!safeDirectCopy(latest)) { this.updateAvailability(entry); this.scheduleRefresh(); return; }
    void copyMatrix(latest.rows, latest.sourceElement.ownerDocument)
      .then(() => this.feedback(entry, true), () => this.feedback(entry, false));
  }

  private feedback(entry: IconEntry, success: boolean): void {
    if (this.disposed || !entry.button.isConnected) return;
    if (entry.feedbackTimer !== undefined) this.view.clearTimeout(entry.feedbackTimer);
    entry.button.dataset.state = success ? 'success' : 'error';
    entry.button.textContent = success ? '✓' : '!';
    entry.button.dataset.tooltip = success ? '已复制，可粘贴到 Excel' : '复制失败，请在扩展面板中重试';
    entry.button.title = entry.button.dataset.tooltip;
    entry.feedbackTimer = this.view.setTimeout(() => {
      entry.feedbackTimer = undefined;
      entry.button.textContent = '⧉';
      this.updateAvailability(entry);
      delete entry.button.dataset.state;
    }, 2000);
  }

  private position(): void {
    for (const { candidate: { sourceElement: anchor }, geometryTarget: target, button } of this.entries.values()) {
      const view = anchor.ownerDocument.defaultView;
      const rect = target.getBoundingClientRect();
      let left = Math.max(0, rect.left);
      let top = Math.max(0, rect.top);
      let right = Math.min(view?.innerWidth ?? 0, rect.right);
      let bottom = Math.min(view?.innerHeight ?? 0, rect.bottom);
      let hidden = !anchor.isConnected || !target.isConnected || rect.width <= 0 || rect.height <= 0;
      for (let element: Element | null = target; element; element = composedParent(element)) {
        const style = view?.getComputedStyle(element);
        if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') hidden = true;
        if (element === target) continue;
        const bounds = element.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style?.overflowX || style?.overflow || '')) {
          left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(style?.overflowY || style?.overflow || '')) {
          top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
        }
      }
      button.hidden = hidden || right <= left || bottom <= top;
      button.style.left = `${Math.max(left, right - 32)}px`;
      button.style.top = `${top + 4}px`;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.refreshTimer !== undefined) this.view.clearTimeout(this.refreshTimer);
    if (this.positionTimer !== undefined) {
      if (this.useRaf) this.view.cancelAnimationFrame(this.positionTimer);
      else this.view.clearTimeout(this.positionTimer);
    }
    for (const entry of this.entries.values()) {
      if (entry.feedbackTimer !== undefined) this.view.clearTimeout(entry.feedbackTimer);
    }
    this.entries.clear();
    for (const layer of this.layers.values()) layer.cleanup();
    this.layers.clear();
    for (const cleanup of this.shadowWatchers.values()) cleanup();
    this.shadowWatchers.clear();
    this.storageChanges?.removeListener(this.onStorageChange);
  }
}

/** Repeated injections reuse the isolated-world controller instead of duplicating icons. */
export function setTableIcons(enabled: boolean): void {
  if (!enabled) {
    controllerGlobal.__TableFlowIconController?.dispose();
    delete controllerGlobal.__TableFlowIconController;
    return;
  }
  controllerGlobal.__TableFlowIconController ??= new TableIconController(document);
  controllerGlobal.__TableFlowIconController.refresh();
}
