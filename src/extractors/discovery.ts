import { createVisibilityCheck, extractHtmlTable } from './html-table';
import type { ScanOptions, TableMatrix } from '../shared/table';

export interface TableCandidate {
  anchor: HTMLTableElement;
  matrix: TableMatrix;
  label?: string;
}

interface ComponentPart {
  table: HTMLTableElement;
  matrix: TableMatrix;
}

function hasText(matrix: TableMatrix): boolean {
  return matrix.some((row) => row.some((cell) => cell.trim() !== ''));
}

function width(matrix: TableMatrix): number {
  return matrix[0]?.length ?? 0;
}

function pad(matrix: TableMatrix, columns: number): TableMatrix {
  return matrix.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? ''));
}

function isDataTable(table: HTMLTableElement, matrix: TableMatrix, isHidden: (element: Element) => boolean): boolean {
  if (isHidden(table) || !hasText(matrix) || table.querySelector('table')) return false;
  if (table.matches('[role="presentation"], [role="none"]')
    || table.closest('nav, [role="navigation"]')) return false;

  const cells = Array.from(table.rows).flatMap((row) => Array.from(row.cells));
  const headers = cells.filter((cell) => cell.tagName === 'TH' && !isHidden(cell));
  const controlCells = cells.filter((cell) => cell.querySelector('select, input, textarea, button'));
  const hasColumnHeader = Array.from(table.rows).some((row) => row.cells.length > 0
    && Array.from(row.cells).every((cell) => cell.tagName === 'TH' && !isHidden(cell)));
  // Form field labels can be th elements too; they are not a column header row.
  if (table.closest('form') && controlCells.length > 0 && !hasColumnHeader) return false;
  // Column headers are a strong data signal, including a one-column data table.
  if (headers.length > 0) return true;

  if (matrix.length < 2 || width(matrix) < 2) return false;
  if (controlCells.length > 0
    && (table.closest('form') || controlCells.length >= cells.length / 2)) return false;

  const nonemptyCells = cells.filter((cell) => !isHidden(cell) && cell.textContent?.trim());
  const linkCells = nonemptyCells.filter((cell) => cell.querySelector('a[href]'));
  // Anonymous menus often use a table containing almost nothing but links.
  // Numeric values or actual column headers keep linked data tables eligible.
  const containsNumbers = matrix.some((row) => row.some((cell) => /\d/.test(cell)));
  if (!containsNumbers && table.querySelectorAll('a[href]').length >= 3
    && linkCells.length >= nonemptyCells.length * 0.8) return false;
  return true;
}

function componentPart(
  wrapper: Element,
  selector: string,
  isHidden: (element: Element) => boolean,
  jqGrid = false,
): ComponentPart | undefined {
  const tables = Array.from(wrapper.querySelectorAll<HTMLTableElement>(selector))
    .filter((table) => !isHidden(table) && !table.querySelector('table'));
  if (tables.length !== 1) return undefined;
  const table = tables[0]!;
  let matrix = extractHtmlTable(table);
  if (jqGrid) {
    // jqGrid has a sizing row that is not a data record.
    const sizingRows = new Set(Array.from(table.rows)
      .flatMap((row, index) => row.classList.contains('jqgfirstrow') ? [index] : []));
    matrix = matrix.filter((_, index) => !sizingRows.has(index));
  }
  return { table, matrix };
}

function samePrefix(left: TableMatrix, right: TableMatrix): boolean {
  return left.length > 0 && left.length === right.length && width(left) <= width(right)
    && hasText(left)
    && left.every((row, index) => row.every((cell, column) => cell === right[index]?.[column]));
}

function sameColumnKeys(left: ComponentPart, right: ComponentPart): boolean {
  const firstDataRow = (part: ComponentPart) => Array.from(part.table.rows)
    .find((row) => !row.classList.contains('jqgfirstrow') && row.cells.length > 0);
  const leftCells = Array.from(firstDataRow(left)?.cells ?? []);
  const rightCells = Array.from(firstDataRow(right)?.cells ?? []);
  const key = (cell: HTMLTableCellElement) => cell.getAttribute('aria-describedby') || cell.id;
  return leftCells.length > 0 && leftCells.length <= rightCells.length
    && leftCells.every((cell, index) => key(cell) !== '' && key(cell) === key(rightCells[index]!));
}

function combineComponent(
  mainBody: ComponentPart | undefined,
  mainHeader: ComponentPart | undefined,
  frozenBody: ComponentPart | undefined,
  frozenHeader: ComponentPart | undefined,
  jqGrid: boolean,
): { matrix: TableMatrix; parts: HTMLTableElement[] } | undefined {
  if (!mainBody || (!hasText(mainBody.matrix) && !hasText(frozenBody?.matrix ?? []))) return undefined;
  const parts = [mainBody.table];
  let body = mainBody.matrix;
  let header = mainHeader?.matrix ?? [];
  if (mainHeader) parts.push(mainHeader.table);

  if (frozenBody || frozenHeader) {
    // Refuse ambiguous partial grids rather than combining unrelated rows.
    if (!frozenBody || frozenBody.matrix.length !== body.length
      || (frozenHeader?.matrix.length ?? 0) !== header.length) return undefined;
    const leftBody = frozenBody.matrix;
    const leftHeader = frozenHeader?.matrix ?? [];
    const duplicatedPrefix = jqGrid && (samePrefix(leftHeader, header)
      || (frozenHeader !== undefined && mainHeader !== undefined && sameColumnKeys(frozenHeader, mainHeader))
      || sameColumnKeys(frozenBody, mainBody)
      || (header.length === 0 && samePrefix(leftBody, body)));
    const prefixWidth = width(leftBody);
    body = body.map((row, index) => [
      ...leftBody[index]!, ...row.slice(duplicatedPrefix ? prefixWidth : 0),
    ]);
    header = header.map((row, index) => [
      ...leftHeader[index]!, ...row.slice(duplicatedPrefix ? width(leftHeader) : 0),
    ]);
    parts.push(frozenBody.table);
    if (frozenHeader) parts.push(frozenHeader.table);
  }
  const columns = Math.max(width(body), width(header));
  return { matrix: [...pad(header, columns), ...pad(body, columns)], parts };
}

/** Detect data tables and a small set of known split-table widgets, without fetching rows. */
export function discoverTables(doc: ParentNode, options: ScanOptions = {}): TableCandidate[] {
  const isHidden = createVisibilityCheck();
  const combined = new Map<HTMLTableElement, TableCandidate>();
  const consumed = new Set<HTMLTableElement>();
  const componentRoots = (selector: string): Element[] => [
    ...('matches' in doc && typeof doc.matches === 'function' && doc.matches(selector) ? [doc as Element] : []),
    ...doc.querySelectorAll(selector),
  ];

  function addComponent(
    mainBody: ComponentPart | undefined,
    mainHeader: ComponentPart | undefined,
    frozenBody: ComponentPart | undefined,
    frozenHeader: ComponentPart | undefined,
    label: string,
    jqGrid = false,
  ): void {
    const result = combineComponent(mainBody, mainHeader, frozenBody, frozenHeader, jqGrid);
    if (!result || !mainBody) return;
    combined.set(mainBody.table, { anchor: mainBody.table, matrix: result.matrix, label });
    for (const table of result.parts) consumed.add(table);
  }

  for (const view of componentRoots('.datagrid-view')) {
    const main = view.querySelector('.datagrid-view2') ?? view;
    const frozen = view.querySelector('.datagrid-view1');
    addComponent(
      componentPart(main, '.datagrid-body table', isHidden),
      componentPart(main, '.datagrid-header table', isHidden),
      frozen ? componentPart(frozen, '.datagrid-body table', isHidden) : undefined,
      frozen ? componentPart(frozen, '.datagrid-header table', isHidden) : undefined,
      'EasyUI 表格',
    );
  }

  for (const grid of componentRoots('.ui-jqgrid, .ui-jqgrid-view')) {
    if (grid.matches('.ui-jqgrid-view') && grid.closest('.ui-jqgrid')) continue;
    addComponent(
      componentPart(grid, '.ui-jqgrid-bdiv:not(.frozen-bdiv) table.ui-jqgrid-btable', isHidden, true),
      componentPart(grid, '.ui-jqgrid-hdiv:not(.frozen-div) table.ui-jqgrid-htable', isHidden, true),
      componentPart(grid, '.frozen-bdiv table', isHidden, true),
      componentPart(grid, '.frozen-div table', isHidden, true),
      'jqGrid 表格',
      true,
    );
  }

  const candidates: TableCandidate[] = [];
  for (const table of doc.querySelectorAll<HTMLTableElement>('table')) {
    const candidate = combined.get(table);
    if (candidate) {
      candidates.push(candidate);
      continue;
    }
    if (consumed.has(table)) continue;
    const matrix = extractHtmlTable(table);
    if (options.includeLayout || isDataTable(table, matrix, isHidden)) {
      candidates.push({ anchor: table, matrix });
    }
  }
  return candidates;
}
