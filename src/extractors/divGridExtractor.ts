import { createTextExtractor, createVisibilityCheck, hasScrollableViewport, normalizeMatrix } from './normalize';
import type { Extractor, TableCandidate } from './types';

const ids = new WeakMap<Element, string>();
let sequence = 0;

function rowsOf(element: Element): Element[] {
  return Array.from(element.children).filter((row) => row.children.length >= 2
    && ['DIV', 'LI', 'SECTION'].includes(row.tagName));
}

export const divGridExtractor: Extractor = {
  type: 'div-grid', priority: 10,
  detect(root) {
    return Array.from(root.querySelectorAll('div,section,ul,[data-grid],[data-table]'))
      .filter((element) => rowsOf(element).length >= 3
        && !element.closest('table,nav,form,[role="navigation"],[role="grid"],[role="table"],[role="treegrid"]'));
  },
  extract(element): TableCandidate | null {
    if (element.closest('table,nav,form,[role="navigation"]')) return null;
    const hidden = createVisibilityCheck();
    if (hidden(element)) return null;
    const domRows = rowsOf(element).filter((row) => !hidden(row));
    if (domRows.length < 3 || domRows.length !== element.children.length) return null;
    const counts = domRows.map((row) => row.children.length);
    const columns = counts[0]!;
    if (columns < 2 || columns > 1000 || counts.some((count) => count !== columns)) return null;
    const read = createTextExtractor();
    const rows = normalizeMatrix(domRows.map((row) => Array.from(row.children, read)));
    const density = rows.flat().filter(Boolean).length / (rows.length * columns);
    if (density < 0.4) return null;
    const rowTag = domRows[0]!.tagName;
    const cellTags = Array.from(domRows[0]!.children, (cell) => cell.tagName);
    const repeated = domRows.every((row) => row.tagName === rowTag
      && Array.from(row.children).every((cell, index) => cell.tagName === cellTags[index]));
    if (!repeated) return null;
    const firstGeometry = Array.from(domRows[0]!.children, (cell) => cell.getBoundingClientRect());
    const hasGeometry = firstGeometry.every((rect) => rect.width > 0);
    const aligned = hasGeometry && domRows.slice(1).every((row) => Array.from(row.children)
      .every((cell, index) => Math.abs(cell.getBoundingClientRect().left - firstGeometry[index]!.left) <= 4));
    if (hasGeometry && !aligned) return null;
    const headers = new Set(domRows.filter((row) => row.getAttribute('data-header') === 'true'
      || Array.from(row.children).every((cell) => cell.getAttribute('role') === 'columnheader')));
    const headerRows = headers.size;
    const total = Number(element.getAttribute('data-row-count') || element.getAttribute('data-total-rows'));
    const expectedRowCount = Number.isSafeInteger(total) && total > 0 ? total : undefined;
    const incomplete = (expectedRowCount !== undefined && expectedRowCount > rows.length)
      || element.getAttribute('data-virtualized') === 'true';
    const virtualized = incomplete && hasScrollableViewport(element);
    let id = ids.get(element);
    if (!id) { id = `div-${++sequence}`; ids.set(element, id); }
    return { id, type: 'div-grid', confidence: aligned ? 0.82 : 0.66, rows, columns, sourceElement: element,
      metadata: { headerRows, complete: !incomplete,
        rowMeta: domRows.map((row) => ({ kind: headers.has(row) ? 'header' : row.getAttribute('data-summary') === 'true' ? 'summary' : 'data',
          ...(row.getAttribute('data-row-key') || row.getAttribute('data-id')
            ? { key: row.getAttribute('data-row-key') || row.getAttribute('data-id') || '' } : {}) })),
        ...(expectedRowCount !== undefined ? { expectedRowCount } : {}),
        ...(incomplete ? { ...(virtualized ? { virtualized: true } : {}), unsupported_reason: 'INCOMPLETE_GRID' as const,
          warnings: ['只读取到通用网格当前渲染的行。'] } : {}),
      },
    };
  },
};

export default divGridExtractor;
