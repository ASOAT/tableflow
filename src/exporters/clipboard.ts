import type { TableMatrix } from '../shared/table';
import { toTsv } from './delimited';

function createClipboardTable(matrix: TableMatrix, doc: Document): HTMLTableElement {
  const table = doc.createElement('table');
  const body = table.createTBody();
  for (const row of matrix) {
    const tableRow = body.insertRow();
    for (const value of row) {
      const cell = tableRow.insertCell();
      cell.style.whiteSpace = 'pre-wrap';
      const lines = value.split(/\r\n|\r|\n/);
      lines.forEach((line, index) => {
        if (index > 0) cell.append(doc.createElement('br'));
        const text = doc.createElement('span');
        text.textContent = line;
        cell.append(text);
      });
    }
  }
  return table;
}

/** Data is inserted as text, so webpage cell values cannot inject HTML. */
export function toClipboardHtml(matrix: TableMatrix, doc: Document = document): string {
  return createClipboardTable(matrix, doc).outerHTML;
}

function copyViaSelection(matrix: TableMatrix, plainText: string, html: string, doc: Document): boolean {
  if (typeof doc.execCommand !== 'function') return false;

  const selection = doc.getSelection();
  const previousRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const previousFocus = doc.activeElement as HTMLElement | null;
  const container = doc.createElement('div');
  container.setAttribute('data-tableflow-clipboard', '');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;';
  const textarea = doc.createElement('textarea');
  textarea.value = plainText;
  textarea.setAttribute('aria-label', 'TableFlow 临时复制内容');
  container.append(textarea);
  const handleCopy = (event: ClipboardEvent): void => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', plainText);
    event.clipboardData.setData('text/html', html);
    event.preventDefault();
  };

  const execCopy = (): boolean => {
    try {
      return doc.execCommand('copy');
    } catch {
      return false;
    }
  };

  doc.addEventListener('copy', handleCopy);
  (doc.body ?? doc.documentElement).append(container);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    if (execCopy()) return true;

    // Some pages only permit copying an actual contenteditable selection.
    const editable = doc.createElement('div');
    editable.contentEditable = 'true';
    editable.append(createClipboardTable(matrix, doc));
    container.append(editable);
    editable.focus({ preventScroll: true });
    if (!selection) return false;
    const range = doc.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
    return execCopy();
  } finally {
    doc.removeEventListener('copy', handleCopy);
    container.remove();
    if (typeof previousFocus?.focus === 'function') previousFocus.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      previousRanges.forEach((range) => selection.addRange(range));
    }
  }
}

/** Call directly from a click handler so clipboard writes retain user activation. */
export async function copyMatrix(matrix: TableMatrix, doc: Document = document): Promise<void> {
  const plainText = toTsv(matrix);
  const html = toClipboardHtml(matrix, doc);
  const clipboard = doc.defaultView?.navigator.clipboard;
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  const ClipboardItemType = view?.ClipboardItem ?? globalThis.ClipboardItem;

  if (clipboard?.write && typeof ClipboardItemType === 'function') {
    try {
      // This API is invoked before the first await, while the click is active.
      await clipboard.write([
        new ClipboardItemType({
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return;
    } catch {
      // Browser policy or MIME support may require one of the simpler paths.
    }
  }

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(plainText);
      return;
    } catch {
      // HTTP pages may need selection-based copying within the user's click.
    }
  }

  if (copyViaSelection(matrix, plainText, html, doc)) return;
  throw new Error('复制失败。请保持页面处于前台，重新点击复制，或在扩展弹窗中重试。');
}
