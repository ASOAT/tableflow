import type { ExtractedTable, TableMatrix } from '../shared/table';

import { createTextExtractor, normalizeMatrix } from './normalize';
export { createVisibilityCheck } from './normalize';

export interface TableExtractionLimits { maxExpandedCells: number; maxColumns: number; }
export const nativeExtractionLimits: Readonly<TableExtractionLimits> = {
  maxExpandedCells: 200_000, maxColumns: 1_000,
};

/** A bounded, explicitly incomplete preview accompanies the safety failure. */
export class TableExtractionLimitError extends Error {
  constructor(message: string, readonly preview: TableMatrix) {
    super(message);
    this.name = 'TableExtractionLimitError';
  }
}

/** Expand HTML spans; text appears only in the top-left cell of each span. */
export function extractHtmlTable(
  table: HTMLTableElement,
  cellText?: (cell: HTMLTableCellElement) => string,
  limits: Readonly<TableExtractionLimits> = nativeExtractionLimits,
): TableMatrix {
  const rows = Array.from(table.rows);
  const readText = cellText ?? createTextExtractor({ includeButtons: false });
  const limit = (message: string): never => {
    // This is a DOM-cell preview, not a claimed span-expanded export matrix.
    const previewRows = rows.slice(0, Math.min(50, limits.maxExpandedCells));
    const previewColumns = Math.min(20, limits.maxColumns,
      Math.max(1, Math.floor(limits.maxExpandedCells / Math.max(1, previewRows.length))));
    const preview = normalizeMatrix(previewRows.map((row) => Array.from(row.cells)
      .slice(0, previewColumns).map(readText)));
    throw new TableExtractionLimitError(message, preview);
  };
  if (rows.length > limits.maxExpandedCells) limit('表格行数超过安全展开预算；仅显示未展开的有界预览。');
  const matrix: TableMatrix = rows.map(() => []);
  const occupied = rows.map(() => new Set<number>());
  let expandedCells = 0;
  const groupEnds: number[] = [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    groupEnds[index] = rows[index]!.parentElement === rows[index + 1]?.parentElement
      ? groupEnds[index + 1]!
      : index + 1;
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    let columnIndex = 0;
    // Row spans are scoped to a thead/tbody/tfoot (or direct-table row group).
    const groupEnd = groupEnds[rowIndex]!;

    for (const cell of Array.from(row.cells)) {
      const columnSpan = Math.max(1, cell.colSpan);
      const rowSpan = cell.rowSpan === 0
        ? groupEnd - rowIndex
        : Math.min(Math.max(1, cell.rowSpan), groupEnd - rowIndex);

      // Find a free run so even malformed overlapping spans never overwrite data.
      while (Array.from({ length: columnSpan }, (_, offset) => columnIndex + offset)
        .some((column) => occupied[rowIndex]!.has(column))) {
        columnIndex += 1;
        if (columnIndex + columnSpan > limits.maxColumns) limit('表格跨度产生超过 1000 列的结构；仅显示未展开的有界预览。');
      }

      const rightEdge = columnIndex + columnSpan;
      if (rightEdge > limits.maxColumns) limit('表格跨度产生超过 1000 列的结构；仅显示未展开的有界预览。');
      if (expandedCells + rowSpan * columnSpan > limits.maxExpandedCells
        || rows.length * rightEdge > limits.maxExpandedCells) {
        limit('表格跨度或规则矩阵超过 200000 个单元格的安全预算；仅显示未展开的有界预览。');
      }
      expandedCells += rowSpan * columnSpan;

      for (let y = rowIndex; y < rowIndex + rowSpan; y += 1) {
        for (let x = columnIndex; x < columnIndex + columnSpan; x += 1) {
          occupied[y]!.add(x);
          matrix[y]![x] = y === rowIndex && x === columnIndex ? readText(cell) : '';
        }
      }
      columnIndex += columnSpan;
    }
  }

  const columnCount = matrix.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  return matrix.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''));
}

/** Scan standard tables in the main document, including nested and hidden tables. */
export function extractHtmlTables(root: Document): ExtractedTable[] {
  return Array.from(root.querySelectorAll<HTMLTableElement>('table'), (table, index) => {
    const matrix = extractHtmlTable(table);
    const preview = matrix.slice(0, 2)
      .map((row) => row.slice(0, 3).map((cell) => cell.replace(/\s+/g, ' ')).join(' · '))
      .join(' / ')
      .slice(0, 100);

    return {
      id: index + 1,
      rowCount: matrix.length,
      columnCount: matrix[0]?.length ?? 0,
      preview,
      matrix,
    };
  });
}
