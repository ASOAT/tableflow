import { createTextExtractor, createVisibilityCheck, hasScrollableViewport, normalizeMatrix } from './normalize';
import type { Diagnostic, Extractor, RowMetadata, TableCandidate } from './types';

const gridSelector = '[role="table"],[role="grid"],[role="treegrid"]';
const cellSelector = '[role="columnheader"],[role="rowheader"],[role="gridcell"],[role="cell"]';
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 1_000;
const MAX_EXPANDED_CELLS = 200_000;
const ids = new WeakMap<Element, string>();
let sequence = 0;

function positive(element: Element, attribute: string): number | undefined {
  const value = Number(element.getAttribute(attribute));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export const ariaGridExtractor: Extractor = {
  type: 'aria-grid', priority: 90,
  detect(root) { return Array.from(root.querySelectorAll(gridSelector)); },
  extract(element): TableCandidate | null {
    if (!element.matches(gridSelector)) return null;
    const hidden = createVisibilityCheck();
    if (hidden(element)) return null;
    const read = createTextExtractor();
    const physicalRows = Array.from(element.querySelectorAll('[role="row"]'))
      .filter((row) => row.closest(gridSelector) === element && !hidden(row));
    // Modern semantic grids can expose flat columnheaders outside a role=row wrapper.
    const orphanHeaders = Array.from(element.querySelectorAll('[role="columnheader"]'))
      .filter((cell) => cell.closest(gridSelector) === element && !cell.closest('[role="row"]') && !hidden(cell));
    const sourceRows = orphanHeaders.length > 0 ? [element, ...physicalRows] : physicalRows;
    if (sourceRows.length === 0) return null;
    const diagnostics: Diagnostic[] = [];
    const diagnose = (code: 'MALFORMED_STRUCTURE' | 'INCOMPLETE_GRID', message: string) => {
      if (!diagnostics.some((entry) => entry.message === message)) diagnostics.push({ code, message,
        certainty: 'confirmed', sourceElement: element });
    };
    const logicalRows = new Map<number, { cells: string[]; occupied: Set<number>; meta: RowMetadata }>();
    const rowIndices = new Map<Element, number>();
    const keys = new Map<string, number>();
    let nextIndex = 1;
    let expandedCells = 0;
    for (const row of sourceRows) {
      const declared = row === element ? undefined : positive(row, 'aria-rowindex');
      const key = row === element ? undefined : row.getAttribute('data-row-key') || row.getAttribute('data-id') || undefined;
      const index = declared ?? (key ? keys.get(key) : undefined) ?? nextIndex;
      if (row.hasAttribute('aria-rowindex') && declared === undefined) diagnose('MALFORMED_STRUCTURE', '行索引必须为正整数。');
      if (index > MAX_ROWS || rowIndices.size >= MAX_ROWS) {
        diagnose('MALFORMED_STRUCTURE', '行索引或已渲染行数超过安全边界。');
        continue;
      }
      if (key) keys.set(key, index);
      rowIndices.set(row, index);
      nextIndex = Math.max(nextIndex, index + 1);
    }
    const maximumLogicalIndex = Math.max(0, ...rowIndices.values());
    const ensureRow = (index: number) => {
      let row = logicalRows.get(index);
      if (!row) {
        row = { cells: [], occupied: new Set<number>(), meta: { kind: 'data' } };
        logicalRows.set(index, row);
      }
      return row;
    };
    for (const sourceRow of sourceRows) {
      const index = rowIndices.get(sourceRow);
      if (index === undefined) continue;
      const target = ensureRow(index);
      const declaredIndex = sourceRow === element ? undefined : positive(sourceRow, 'aria-rowindex');
      if (declaredIndex !== undefined) target.meta.index = declaredIndex;
      const sourceCells = sourceRow === element ? orphanHeaders : Array.from(sourceRow.querySelectorAll(cellSelector))
        .filter((cell) => cell.closest('[role="row"]') === sourceRow);
      const isHeader = sourceCells.length > 0 && sourceCells.every((cell) => cell.getAttribute('role') === 'columnheader');
      target.meta.kind = isHeader ? 'header' : sourceRow.getAttribute('data-summary') === 'true' ? 'summary' : 'data';
      const key = sourceRow.getAttribute('data-row-key') || sourceRow.getAttribute('data-id');
      if (key) target.meta.key = key;
      let nextColumn = 0;
      for (const cell of sourceCells) {
        const explicitColumn = positive(cell, 'aria-colindex');
        if (cell.hasAttribute('aria-colindex') && explicitColumn === undefined) diagnose('MALFORMED_STRUCTURE', '列索引必须为正整数。');
        let column = explicitColumn === undefined ? nextColumn : explicitColumn - 1;
        if (explicitColumn === undefined) while (target.occupied.has(column)) column += 1;
        if (column >= MAX_COLUMNS) { diagnose('MALFORMED_STRUCTURE', '列索引超过安全边界。'); continue; }
        const requestedColumns = positive(cell, 'aria-colspan') ?? 1;
        const requestedRows = positive(cell, 'aria-rowspan') ?? 1;
        if ((cell.hasAttribute('aria-colspan') && positive(cell, 'aria-colspan') === undefined)
          || (cell.hasAttribute('aria-rowspan') && positive(cell, 'aria-rowspan') === undefined)) {
          diagnose('MALFORMED_STRUCTURE', '跨度必须为正整数。');
        }
        const columns = Math.min(requestedColumns, MAX_COLUMNS - column);
        const rows = Math.min(requestedRows, maximumLogicalIndex - index + 1);
        if (columns !== requestedColumns || rows !== requestedRows) diagnose('MALFORMED_STRUCTURE', '跨度超出可读取的行列边界。');
        if (expandedCells + rows * columns > MAX_EXPANDED_CELLS) {
          diagnose('MALFORMED_STRUCTURE', '跨度展开超过安全单元格数量。');
          continue;
        }
        expandedCells += rows * columns;
        const value = read(cell);
        for (let y = index; y < index + rows; y += 1) {
          const targetRow = ensureRow(y);
          for (let x = column; x < column + columns; x += 1) {
            const anchor = y === index && x === column;
            const incoming = anchor ? value : '';
            if (targetRow.occupied.has(x) && targetRow.cells[x] !== incoming && incoming !== '') {
              diagnose('MALFORMED_STRUCTURE', '同一行列位置存在冲突的网格片段。');
              continue;
            }
            if (!targetRow.occupied.has(x) || incoming !== '') targetRow.cells[x] = incoming;
            targetRow.occupied.add(x);
          }
        }
        nextColumn = column + columns;
      }
    }
    let ordered = Array.from(logicalRows).sort(([left], [right]) => left - right);
    if (ordered.length === 0) return null;
    const declaredRows = positive(element, 'aria-rowcount') ?? positive(element, 'data-row-count') ?? positive(element, 'data-total-rows');
    const declaredColumns = positive(element, 'aria-colcount');
    const observedColumns = ordered.reduce((maximum, [, row]) => Math.max(maximum, row.cells.length), 0);
    const columns = Math.min(MAX_COLUMNS, Math.max(observedColumns, declaredColumns ?? 0));
    if (columns > 0 && ordered.length * columns > MAX_EXPANDED_CELLS) {
      diagnose('MALFORMED_STRUCTURE', '规则矩阵超过安全单元格数量。');
      ordered = ordered.slice(0, Math.floor(MAX_EXPANDED_CELLS / columns));
    }
    const observedColumnIndices = [...new Set(ordered.flatMap(([, row]) => [...row.occupied].map((index) => index + 1)))].sort((a, b) => a - b);
    if (declaredColumns !== undefined && declaredColumns > MAX_COLUMNS) diagnose('MALFORMED_STRUCTURE', '声明的列数超过安全边界。');
    if (declaredRows !== undefined && declaredRows > ordered.length) diagnose('INCOMPLETE_GRID', '声明的总行数超过当前已渲染行数。');
    if (ordered.some(([index], position) => index !== position + 1)) diagnose('INCOMPLETE_GRID', '逻辑行索引存在未渲染的间隙。');
    const missingColumns = ordered.some(([, row]) => row.occupied.size < columns);
    if (missingColumns) diagnose('INCOMPLETE_GRID', '部分逻辑列未出现在当前 DOM 中。');
    const declaredVirtual = element.getAttribute('data-virtualized') === 'true';
    const virtualized = ((declaredRows !== undefined && declaredRows > ordered.length) || declaredVirtual)
      && hasScrollableViewport(element);
    if (declaredVirtual && diagnostics.length === 0) diagnose('INCOMPLETE_GRID', '页面声明虚拟网格，当前输出只包含已渲染行。');
    const matrix = normalizeMatrix(ordered.map(([, row]) => Array.from({ length: columns }, (_, index) => row.cells[index] ?? '')));
    let id = ids.get(element);
    if (!id) { id = `aria-${++sequence}`; ids.set(element, id); }
    const rowMeta = ordered.map(([, row]) => row.meta);
    return { id, type: 'aria-grid', confidence: diagnostics.some((entry) => entry.code === 'MALFORMED_STRUCTURE') ? 0.55 : 0.94,
      rows: matrix, columns, sourceElement: element,
      metadata: { headerRows: rowMeta.filter((row) => row.kind === 'header').length,
        complete: diagnostics.length === 0, rowMeta,
        observedColumnIndices,
        ...(missingColumns ? { missingColumns: true } : {}),
        ...(declaredRows !== undefined ? { expectedRowCount: declaredRows } : {}),
        ...(declaredColumns !== undefined ? { expectedColumnCount: declaredColumns } : {}),
        ...(virtualized ? { virtualized: true } : {}),
        ...(diagnostics.length > 0 ? { diagnostics, warnings: diagnostics.map((entry) => entry.message),
          unsupported_reason: diagnostics.some((entry) => entry.code === 'MALFORMED_STRUCTURE') ? 'MALFORMED_STRUCTURE' as const : 'INCOMPLETE_GRID' as const } : {}),
      },
    };
  },
};

export default ariaGridExtractor;
