import { createVisibilityCheck } from './normalize';
import type { Diagnostic } from './types';

export interface AccessibleRoot { root: Document | ShadowRoot; source: string; }

/** Standard APIs can traverse open shadows and same-origin frames only. */
export function walkAccessibleRoots(document: Document): { roots: AccessibleRoot[]; diagnostics: Diagnostic[] } {
  const roots: AccessibleRoot[] = [];
  const diagnostics: Diagnostic[] = [];
  const visited = new Set<Document | ShadowRoot>();
  let frameSequence = 0;
  let shadowSequence = 0;
  function visit(root: Document | ShadowRoot, source: string): void {
    if (visited.has(root)) return;
    visited.add(root);
    roots.push({ root, source });
    const isHidden = createVisibilityCheck();
    for (const element of root.querySelectorAll('*')) {
      if (!element.shadowRoot && !element.matches('iframe,frame')
        && !(element.tagName.includes('-') && element.matches('[role="grid"],[role="table"],[role="treegrid"]'))) continue;
      if (isHidden(element)) continue;
      if (element.shadowRoot) visit(element.shadowRoot, `${source} · 开放 Shadow DOM ${++shadowSequence}`);
      if (element.matches('iframe,frame')) {
        const frame = element as HTMLIFrameElement | HTMLFrameElement;
        try {
          const child = frame.contentDocument;
          if (child) visit(child, `内嵌页面 ${++frameSequence}`);
          else diagnostics.push({ code: 'CROSS_ORIGIN_FRAME_PERMISSION', certainty: 'confirmed',
            message: '当前权限无法读取此内嵌页面，或它尚未就绪。', sourceElement: frame });
        } catch (error) {
          if (!error || typeof error !== 'object' || !('name' in error) || error.name !== 'SecurityError') throw error;
          diagnostics.push({ code: 'CROSS_ORIGIN_FRAME_PERMISSION', certainty: 'confirmed',
            message: '浏览器阻止读取跨域内嵌页面。', sourceElement: frame });
        }
      } else if (element.tagName.includes('-') && !element.shadowRoot
        && element.matches('[role="grid"],[role="table"],[role="treegrid"]')
        && (element.hasAttribute('aria-rowcount') || element.hasAttribute('aria-colcount'))
        && !element.querySelector('table,[role="row"]')) {
        // null shadowRoot also means no shadow root; closed mode cannot be confirmed.
        diagnostics.push({ code: 'CLOSED_SHADOW_ROOT', certainty: 'possible', sourceElement: element,
          message: '此自定义网格未暴露可读取的行；可能使用封闭 Shadow DOM，标准 API 无法确认。' });
      }
    }
  }
  visit(document, '当前页面');
  return { roots, diagnostics };
}
