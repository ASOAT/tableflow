import { extractHtmlTable, TableExtractionLimitError } from './html-table';
import { createTextExtractor, createVisibilityCheck, hasScrollableViewport } from './normalize';
import type { Diagnostic, Extractor, RowMetadata, TableCandidate } from './types';

const ids = new WeakMap<Element, string>();
let sequence = 0;

export const nativeTableExtractor: Extractor = {
  type: 'native-table',
  priority: 100,
  detect(root) { return Array.from(root.querySelectorAll('table')); },
  extract(element): TableCandidate | null {
    if (element.tagName !== 'TABLE') return null;
    const table = element as HTMLTableElement;
    let rows: string[][];
    let boundsFailure: TableExtractionLimitError | undefined;
    try { rows = extractHtmlTable(table, createTextExtractor()); }
    catch (error) {
      if (!(error instanceof TableExtractionLimitError)) throw error;
      boundsFailure = error;
      rows = error.preview;
    }
    const isHidden = createVisibilityCheck();
    const domRows = Array.from(table.rows).slice(0, rows.length);
    const rowMeta: RowMetadata[] = domRows.map((row) => ({
      kind: row.parentElement?.tagName === 'TFOOT' ? 'summary'
        : row.parentElement?.tagName === 'THEAD'
          || (row.cells.length > 0 && Array.from(row.cells).every((cell) => cell.tagName === 'TH')) ? 'header' : 'data',
      ...(Number.isSafeInteger(Number(row.getAttribute('aria-rowindex'))) && Number(row.getAttribute('aria-rowindex')) > 0
        ? { index: Number(row.getAttribute('aria-rowindex')) } : {}),
      ...(row.getAttribute('data-row-key') || row.getAttribute('data-id')
        ? { key: row.getAttribute('data-row-key') || row.getAttribute('data-id') || '' } : {}),
    }));
    const headerRows = rowMeta.filter((row) => row.kind === 'header').length;
    const columns = rows[0]?.length ?? 0;
    const content = rows.flat().filter((cell) => cell !== '');
    const hasControls = table.querySelector('input,select,textarea') !== null;
    const layout = isHidden(table) || table.querySelector('table') !== null
      || table.closest('nav,[role="navigation"]') !== null || table.matches('[role="presentation"],[role="none"]');
    let confidence = headerRows > 0 ? 0.95 : rows.length >= 2 && columns >= 2 ? 0.78 : 0.32;
    if (layout) confidence = 0.1;
    if (hasControls && table.closest('form') && headerRows === 0) confidence = 0.2;
    if (content.length === 0) confidence = 0.05;
    if (headerRows === 0 && !rows.some((row) => row.some((cell) => /\d/.test(cell)))
      && table.querySelectorAll('a[href]').length >= Math.max(3, content.length * 0.8)) confidence = 0.25;
    if (boundsFailure && !layout && content.length > 0) confidence = 0.55;
    const expected = Number(table.getAttribute('aria-rowcount') || table.getAttribute('data-row-count'));
    const expectedRowCount = Number.isSafeInteger(expected) && expected > 0 ? expected : undefined;
    const missingRows = expectedRowCount !== undefined && expectedRowCount > rows.length;
    const incomplete = boundsFailure !== undefined || missingRows;
    const diagnostics: Diagnostic[] = boundsFailure
      ? [{ code: 'MALFORMED_STRUCTURE', message: boundsFailure.message, certainty: 'confirmed', sourceElement: table }]
      : missingRows ? [{ code: 'INCOMPLETE_GRID', message: '声明的总行数超过当前 DOM 行数。', certainty: 'confirmed', sourceElement: table }] : [];
    let id = ids.get(element);
    if (!id) { id = `native-${++sequence}`; ids.set(element, id); }
    return {
      id, type: 'native-table', confidence, rows, columns, sourceElement: table,
      ...(table.caption?.textContent?.trim() ? { title: table.caption.textContent.trim() } : {}),
      metadata: { headerRows, complete: !incomplete, rowMeta,
        ...(expectedRowCount !== undefined ? { expectedRowCount } : {}),
        ...(incomplete ? { ...(!boundsFailure && hasScrollableViewport(table) ? { virtualized: true } : {}),
          unsupported_reason: boundsFailure ? 'MALFORMED_STRUCTURE' as const : 'INCOMPLETE_GRID' as const,
          warnings: boundsFailure ? [boundsFailure.message] : ['页面只渲染了部分行。'], diagnostics } : {}),
      },
    };
  },
};

export default nativeTableExtractor;
