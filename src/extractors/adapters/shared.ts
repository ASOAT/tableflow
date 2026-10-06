import { extractHtmlTable } from '../html-table';
import { createTextExtractor, createVisibilityCheck, hasScrollableViewport, normalizeMatrix } from '../normalize';
import type { CandidateMetadata, ExtractorType, RowMetadata, TableCandidate } from '../types';

export function collectRoots(root: ParentNode, selector: string): Element[] {
  const own = 'matches' in root && typeof root.matches === 'function' && root.matches(selector) ? [root as Element] : [];
  return [...own, ...root.querySelectorAll(selector)];
}

const ids = new WeakMap<Element, number>();
let nextId = 1;
function componentLoading(element: Element, declared = false): boolean {
  const hidden = createVisibilityCheck();
  return declared || element.getAttribute('aria-busy') === 'true'
    || Array.from(element.querySelectorAll('.ant-spin-spinning,.el-loading-mask,.MuiDataGrid-loadingOverlay,.ag-overlay-loading-center,[role="progressbar"]'))
      .some((indicator) => !hidden(indicator) && (indicator.getAttribute('role') !== 'progressbar'
        || !indicator.closest('td,th,[role="gridcell"],[role="cell"]')));
}
export function makeCandidate(
  element: Element, type: ExtractorType, rows: string[][], metadata: CandidateMetadata, confidence = 0.94,
): TableCandidate {
  if (!ids.has(element)) ids.set(element, nextId++);
  const normalized = normalizeMatrix(rows);
  const loading = componentLoading(element, metadata.loading === true);
  const unavailable = !element.isConnected || loading;
  const finalMetadata = unavailable ? {
    ...metadata, complete: false, loading, unsupported_reason: 'INCOMPLETE_GRID' as const,
    warnings: [...metadata.warnings ?? [], loading ? '组件正在加载，当前数据可能变化。' : '组件已离开页面，当前数据不能确认。'],
    diagnostics: [...metadata.diagnostics ?? [], { code: 'INCOMPLETE_GRID' as const, certainty: 'confirmed' as const,
      sourceElement: element, message: loading ? '组件正在加载。' : '组件已卸载。' }],
  } : metadata;
  return {
    id: `${type}:${ids.get(element)}`, type, confidence,
    title: element.getAttribute('aria-label') || element.querySelector('caption')?.textContent?.trim() || undefined,
    rows: normalized, columns: normalized[0]?.length ?? 0, sourceElement: element, metadata: finalMetadata,
  };
}

export function positiveIndex(element: Element, attribute: string): number | undefined {
  const value = Number(element.getAttribute(attribute));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function columnKey(cell: Element): string {
  const index = positiveIndex(cell, 'aria-colindex');
  if (index !== undefined) return `index:${index}`;
  const explicit = cell.getAttribute('data-column-key') || cell.getAttribute('data-col-key')
    || cell.getAttribute('col-id') || cell.getAttribute('data-field');
  if (explicit) return `key:${explicit}`;
  const zeroIndex = cell.getAttribute('data-col-index');
  if (zeroIndex !== null && /^\d+$/.test(zeroIndex)) return `index:${Number(zeroIndex) + 1}`;
  const elementColumn = cell.className.match(/(?:^|\s)(el-table_\d+_column_\d+(?:_column_\d+)*)(?:\s|$)/)?.[1];
  // Element column IDs are globally allocated identifiers, not 1-based positions.
  return elementColumn ? `key:element:${elementColumn}` : '';
}

interface ColumnCell { positions: number[]; element: Element; value: string; }
interface NativeRow { values: string[]; keys: string[]; meta: RowMetadata; columnCells: ColumnCell[] }
interface Part { rows: NativeRow[]; keys: string[] }
interface WidgetOptions {
  type: ExtractorType;
  body: string;
  header: string;
  footer: string;
  fixedLeft: string;
  fixedRight: string;
  expanded: string;
  sizing: string;
  empty?: string;
}

function readPart(table: HTMLTableElement, options: WidgetOptions, forcedKind?: RowMetadata['kind'], skipHeader = false): Part {
  const rows = Array.from(table.rows);
  const values = extractHtmlTable(table, createTextExtractor());
  const hidden = createVisibilityCheck();
  const occupied = rows.map(() => new Set<number>());
  const groupEnds: number[] = [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    groupEnds[index] = rows[index]!.parentElement === rows[index + 1]?.parentElement ? groupEnds[index + 1]! : index + 1;
  }
  const result: NativeRow[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const keys: string[] = [];
    const columnCells: ColumnCell[] = [];
    let column = 0;
    for (const cell of row.cells) {
      while (Array.from({ length: cell.colSpan }, (_, offset) => column + offset)
        .some((index) => occupied[rowIndex]!.has(index))) column += 1;
      const key = columnKey(cell);
      columnCells.push({ positions: Array.from({ length: cell.colSpan }, (_, offset) => column + offset),
        element: cell, value: values[rowIndex]?.[column] ?? '' });
      for (let offset = 0; offset < cell.colSpan; offset += 1) {
        keys[column + offset] = key.startsWith('index:')
          ? `index:${Number(key.slice(6)) + offset}` : offset === 0 ? key : '';
        const spanEnd = cell.rowSpan === 0 ? groupEnds[rowIndex]! : Math.min(groupEnds[rowIndex]!, rowIndex + cell.rowSpan);
        for (let next = rowIndex + 1; next < spanEnd; next += 1) occupied[next]!.add(column + offset);
      }
      column += cell.colSpan;
    }
    if (hidden(row) || (skipHeader && row.parentElement?.tagName === 'THEAD')
      || row.matches(options.sizing) || row.matches(options.expanded) || row.querySelector(options.expanded)) continue;
    const kind = forcedKind ?? (row.parentElement?.tagName === 'THEAD' ? 'header'
      : row.parentElement?.tagName === 'TFOOT' ? 'summary' : 'data');
    result.push({
      values: values[rowIndex] ?? [], keys: Array.from({ length: values[rowIndex]?.length ?? 0 }, (_, index) => keys[index] ?? ''),
      meta: { kind, index: positiveIndex(row, 'aria-rowindex'),
        key: row.getAttribute('data-row-key') || row.getAttribute('row-key') || row.getAttribute('row-id') || undefined },
      columnCells,
    });
  }
  const keyRow = result.find((row) => row.meta.kind === 'data' && row.keys.length === row.values.length && row.keys.every(Boolean))
    ?? [...result].reverse().find((row) => row.keys.length === row.values.length && row.keys.every(Boolean));
  const keys = keyRow?.keys ?? [];
  return { rows: result, keys };
}

function joinSections(body: Part, header: Part | undefined, footer: Part | undefined): Part {
  const rows = [
    ...(body.rows.some((row) => row.meta.kind === 'header') ? [] : header?.rows ?? []),
    ...body.rows,
    ...(body.rows.some((row) => row.meta.kind === 'summary') ? [] : footer?.rows ?? []),
  ];
  return { rows, keys: body.keys.length ? body.keys : header?.keys ?? [] };
}

/** Merge split HTML widgets only when row and column identities establish a safe alignment. */
export function extractTableWidget(element: Element, options: WidgetOptions): TableCandidate | null {
  const hidden = createVisibilityCheck();
  const fixedSelector = `${options.fixedLeft}, ${options.fixedRight}`;
  const tableFor = (selector: string, fixed?: Element): HTMLTableElement | undefined => {
    const tables = Array.from((fixed ?? element).querySelectorAll<HTMLTableElement>(selector))
      .filter((table) => !hidden(table) && !table.closest(options.expanded)
        && (!table.parentElement?.closest('table') || !element.contains(table.parentElement.closest('table')))
        && (fixed !== undefined || !table.closest(fixedSelector)));
    return tables.length === 1 ? tables[0] : undefined;
  };
  const bodyTable = tableFor(options.body);
  if (!bodyTable) return null;
  const headerTable = tableFor(options.header);
  const main = joinSections(readPart(bodyTable, options, undefined, headerTable !== undefined && headerTable !== bodyTable),
    (() => { const table = headerTable; return table && table !== bodyTable ? readPart(table, options, 'header') : undefined; })(),
    (() => { const table = tableFor(options.footer); return table && table !== bodyTable ? readPart(table, options, 'summary') : undefined; })());
  if (!main.rows.length) return null;
  const knownEmpty = options.empty !== undefined && Array.from(element.querySelectorAll(options.empty))
    .some((placeholder) => !hidden(placeholder));
  if (knownEmpty && !main.rows.some((row) => row.meta.kind === 'data') && !componentLoading(element)) {
    // Keep framework ownership so generic native fallback cannot export empty-state UI.
    return makeCandidate(element, options.type, [], { headerRows: 0, complete: true, rowMeta: [], observedColumnIndices: [] });
  }
  const warnings: string[] = [];
  const expanded = element.querySelectorAll(options.expanded).length;
  if (expanded) warnings.push('展开详情行不是数据记录，已排除。');
  const parts: Part[] = [];
  let ambiguous = false;
  for (const selector of [options.fixedLeft, options.fixedRight]) {
    const fixed = element.querySelector(selector);
    if (!fixed || hidden(fixed)) { parts.push({ rows: [], keys: [] }); continue; }
    const table = tableFor(options.body, fixed);
    if (!table) { parts.push({ rows: [], keys: [] }); continue; }
    const header = tableFor(options.header, fixed);
    const footer = tableFor(options.footer, fixed);
    parts.push(joinSections(readPart(table, options, undefined, header !== undefined && header !== table),
      header && header !== table ? readPart(header, options, 'header') : undefined,
      footer && footer !== table ? readPart(footer, options, 'summary') : undefined));
  }
  let result = main.rows;
  const activeParts = [parts[0]!, main, parts[1]!].filter((part) => part.rows.length > 0);
  if (activeParts.length > 1 && main.keys.length > 0 && activeParts.every((part) => part.keys.length > 0)) {
    let keys = [...new Set(activeParts.flatMap((part) => part.keys))];
    if (keys.every((key) => key.startsWith('index:'))) keys = keys.sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
    const addsColumns = keys.some((key) => !main.keys.includes(key));
    if (addsColumns) {
      const dataIdentified = activeParts.every((part) => part.rows
        .filter((row) => row.meta.kind === 'data').every((row) => row.meta.key !== undefined || row.meta.index !== undefined));
      const rowCountsMatch = activeParts.every((part) => ['header', 'data', 'summary'].every((kind) =>
        part.rows.filter((row) => row.meta.kind === kind).length === main.rows.filter((row) => row.meta.kind === kind).length));
      if (!dataIdentified || !rowCountsMatch) ambiguous = true;
      else result = main.rows.map((row, index) => {
        const merged = new Map<string, string>();
        const columnCells: ColumnCell[] = [];
        for (const part of activeParts) {
          const matching = row.meta.kind === 'data'
            ? part.rows.find((other) => other.meta.kind === 'data' && (row.meta.key !== undefined
              ? other.meta.key === row.meta.key : other.meta.index === row.meta.index))
            : part.rows[index];
          if (!matching) { ambiguous = true; continue; }
          for (const cell of matching.columnCells) columnCells.push({ ...cell,
            positions: cell.positions.map((position) => keys.indexOf(part.keys[position] ?? '')).filter((position) => position >= 0) });
          for (let column = 0; column < part.keys.length; column += 1) {
            const key = part.keys[column]!;
            const value = matching.values[column] ?? '';
            if (merged.has(key) && merged.get(key) !== value && value !== '') ambiguous = true;
            if (!merged.has(key) || value !== '') merged.set(key, value);
          }
        }
        return { ...row, keys, values: keys.map((key) => merged.get(key) ?? ''), columnCells };
      });
    }
    // If main rows already contain every column, fixed sections are redundant clones.
  } else if (activeParts.length > 1) {
    // Real legacy fixed sections duplicate main cells; exact prefix/suffix proves this.
    const duplicate = parts.every((part, side) => part.rows.length === 0 || (part.rows.length === main.rows.length
      && part.rows.every((row, index) => row.values.every((cell, column) => cell === main.rows[index]?.values[
        side === 0 ? column : (main.rows[index]?.values.length ?? 0) - row.values.length + column]))));
    if (!duplicate) ambiguous = true;
  }
  if (ambiguous) warnings.push('固定列缺少可靠行列标识或存在冲突，仅提供当前可验证结构。');
  const headerRows = result.filter((row) => row.meta.kind === 'header').length;
  const expectedRowCount = positiveIndex(element, 'aria-rowcount') ?? positiveIndex(element, 'data-row-count');
  const expectedColumnCount = positiveIndex(element, 'aria-colcount');
  const fullRows = normalizeMatrix(result.map((row) => row.values));
  const controlCandidates = new Set<number>();
  const protectedColumns = new Set<number>();
  for (const row of result) {
    for (const cell of row.columnCells) {
      if (cell.positions.length !== 1) continue;
      const position = cell.positions[0]!;
      if (cell.value !== '') protectedColumns.add(position);
      if (isPureControlCell(cell.element, cell.value)) controlCandidates.add(position);
    }
  }
  const removed = new Set([...controlCandidates].filter((position) => !protectedColumns.has(position)));
  for (const row of result) {
    for (const cell of row.columnCells) {
      const anchor = cell.positions[0];
      if (anchor !== undefined && cell.value !== '' && removed.has(anchor)
        && cell.positions.every((position) => removed.has(position))) {
        // A merged business value occupying only those slots makes its anchor non-pure.
        removed.delete(anchor);
      }
    }
  }
  const kept = Array.from({ length: fullRows[0]?.length ?? 0 }, (_, index) => index).filter((index) => !removed.has(index));
  const rows = fullRows.map((values, index) => {
    const migrated = [...values];
    for (const cell of result[index]?.columnCells ?? []) {
      const anchor = cell.positions[0];
      if (anchor === undefined || !removed.has(anchor) || cell.value === '') continue;
      const destination = cell.positions.find((position) => !removed.has(position));
      if (destination !== undefined && !migrated[destination]) migrated[destination] = cell.value;
    }
    return kept.map((position) => migrated[position] ?? '');
  });
  const ambiguousControlColumnIndices = [...new Set(result.filter((row) => row.meta.kind === 'data')
    .flatMap((row) => row.columnCells.filter((cell) => cell.positions.length === 1
      && !removed.has(cell.positions[0]!) && isStateOnlyControlCell(cell.element, cell.value))
      .map((cell) => cell.positions[0]! + 1)))].sort((left, right) => left - right);
  if (ambiguousControlColumnIndices.length) warnings.push('保留的业务列包含没有文字值的选择状态，无法确认其导出含义。');
  const cloneColumnsRemoved = !ambiguous && activeParts.length > 1
    ? Math.max(0, activeParts.reduce((sum, part) => sum + Math.max(0, ...part.rows.map((row) => row.values.length)), 0) - (fullRows[0]?.length ?? 0)) : 0;
  const rowIncomplete = element.getAttribute('data-virtualized') === 'true'
    || (expectedRowCount !== undefined && expectedRowCount > rows.length);
  const incomplete = rowIncomplete
    || (expectedColumnCount !== undefined && expectedColumnCount > (fullRows[0]?.length ?? 0));
  const virtualized = rowIncomplete && hasScrollableViewport(element);
  return makeCandidate(element, options.type, rows, {
    headerRows, complete: !ambiguous && !incomplete && ambiguousControlColumnIndices.length === 0, virtualized, expectedRowCount, expectedColumnCount,
    rowMeta: result.map((row) => row.meta), warnings,
    controlColumnIndices: [...removed].sort((left, right) => left - right).map((index) => index + 1),
    observedColumnIndices: kept.map((index) => index + 1), cloneColumnsRemoved,
    ambiguousControlColumnIndices,
    unsupported_reason: ambiguous ? 'MALFORMED_STRUCTURE' : ambiguousControlColumnIndices.length ? 'UNSUPPORTED_STRUCTURE'
      : incomplete ? 'INCOMPLETE_GRID' : undefined,
  });
}

export function isPureControlCell(element: Element, value: string): boolean {
  return value.trim() === '' && element.querySelector(
    'input[type="checkbox"],input[type="radio"],[role="checkbox"],.ant-table-row-expand-icon,.el-table__expand-icon,.ag-selection-checkbox',
  ) !== null;
}

function isStateOnlyControlCell(element: Element, value: string): boolean {
  if (value.trim() !== '') return false;
  const hidden = createVisibilityCheck();
  return !hidden(element) && Array.from(element.querySelectorAll('input[type="checkbox"],input[type="radio"],[role="checkbox"]'))
    .some((control) => {
      if (!hidden(control)) return true;
      // Frameworks hide the native input while a visible checkbox wrapper renders its state.
      const renderer = control.closest('label,.ant-checkbox,.ant-radio,.el-checkbox,.el-radio,.MuiCheckbox-root,.MuiRadio-root,.ag-checkbox-input-wrapper');
      return renderer !== null && element.contains(renderer) && !hidden(renderer);
    });
}

/** Compact a semantic grid to materialized business columns, without inventing missing cells. */
export function filterGridColumns(
  rows: string[][],
  metadata: CandidateMetadata,
  cells: Array<{ element: Element; index: number; value: string; kind?: RowMetadata['kind'] }>,
  compact = true,
  matrixColumnIndices?: number[],
): { rows: string[][]; metadata: CandidateMetadata } {
  const controls = new Set<number>();
  const business = new Set<number>();
  for (const cell of cells) {
    if (cell.value !== '') business.add(cell.index);
    if (isPureControlCell(cell.element, cell.value)) controls.add(cell.index);
  }
  const removed = [...controls].filter((index) => !business.has(index)).sort((a, b) => a - b);
  const observed = metadata.observedColumnIndices ?? Array.from({ length: rows[0]?.length ?? 0 }, (_, index) => index + 1);
  const kept = (compact ? observed : Array.from({ length: rows[0]?.length ?? 0 }, (_, index) => index + 1))
    .filter((index) => !removed.includes(index));
  const ambiguousControlColumnIndices = [...new Set(cells.filter((cell) => cell.kind === 'data'
    && kept.includes(cell.index) && isStateOnlyControlCell(cell.element, cell.value)).map((cell) => cell.index))]
    .sort((left, right) => left - right);
  const positions = new Map((matrixColumnIndices ?? Array.from({ length: rows[0]?.length ?? 0 }, (_, index) => index + 1))
    .map((index, position) => [index, position]));
  return { rows: rows.map((row) => kept.map((index) => row[positions.get(index) ?? -1] ?? '')),
    metadata: { ...metadata, observedColumnIndices: observed.filter((index) => !removed.includes(index)),
      controlColumnIndices: removed,
      ambiguousControlColumnIndices,
      ...(ambiguousControlColumnIndices.length ? { complete: false,
        unsupported_reason: metadata.unsupported_reason && metadata.unsupported_reason !== 'INCOMPLETE_GRID'
          ? metadata.unsupported_reason : 'UNSUPPORTED_STRUCTURE' as const,
        warnings: [...metadata.warnings ?? [], '保留的业务列包含没有文字值的选择状态，无法确认其导出含义。'] } : {}),
    } };
}
