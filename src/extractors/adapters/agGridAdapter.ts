import { createTextExtractor, createVisibilityCheck, hasScrollableViewport } from '../normalize';
import type { Diagnostic, Extractor, RowMetadata } from '../types';
import { collectRoots, filterGridColumns, makeCandidate, positiveIndex } from './shared';

function sectionRank(element: Element): number {
  if (element.closest('.ag-pinned-left-header, .ag-pinned-left-cols-container, .ag-grid-pinned-left-cells')) return 0;
  if (element.closest('.ag-pinned-right-header, .ag-pinned-right-cols-container, .ag-grid-pinned-right-cells')) return 2;
  return 1;
}

interface GridRow { meta: RowMetadata; order: number; values: Map<string, string> }
const MAX_COLUMNS = 1_000;
const MAX_ROWS = 10_000;
const MAX_CELLS = 200_000;
const cellSelector = '.ag-cell, .ag-header-cell, .ag-header-group-cell, [role="gridcell"], [role="columnheader"]';
export const agGridAdapter: Extractor = {
  type: 'ag-grid', priority: 33,
  detect: (root) => collectRoots(root, '.ag-root, .ag-root-wrapper').filter((element) =>
    (!element.matches('.ag-root-wrapper') || !element.querySelector('.ag-root'))
    && !!element.querySelector('.ag-row .ag-cell, .ag-header-row .ag-header-cell')),
  extract: (element) => {
    const hidden = createVisibilityCheck();
    const read = createTextExtractor();
    // New AG releases move the semantic counts into an inner viewport role=grid.
    const semanticGrid = element.matches('[role="grid"],[role="treegrid"]') ? element
      : Array.from(element.querySelectorAll('[role="grid"],[role="treegrid"]'))
        .find((grid) => grid.closest('.ag-root,.ag-root-wrapper') === element) ?? element;
    const diagnostics: Diagnostic[] = [];
    let bounded = false;
    const bound = (message: string) => {
      bounded = true;
      if (!diagnostics.some((diagnostic) => diagnostic.message === message)) diagnostics.push({
        code: 'MALFORMED_STRUCTURE', certainty: 'confirmed', sourceElement: element, message,
      });
    };
    const domRows: Element[] = [];
    for (const row of element.querySelectorAll('.ag-header-row, .ag-row')) {
      if (row.closest('.ag-root, .ag-root-wrapper') !== element || row.matches('.ag-full-width-row') || hidden(row)) continue;
      if (domRows.length === MAX_ROWS) { bound('已渲染行数超过 10000 行安全上限。'); break; }
      domRows.push(row);
    }
    if (!domRows.length) return null;
    const headerLevels = new Map<Element, number>();
    const parentLevels = new WeakMap<Element, number>();
    const headerIdentities = new Set<number>();
    const rowCells = new Map<Element, Element[]>();
    let physicalCells = 0;
    for (const row of domRows) {
      if (row.matches('.ag-header-row') && row.parentElement) {
        const level = (parentLevels.get(row.parentElement) ?? 0) + 1;
        parentLevels.set(row.parentElement, level);
        headerLevels.set(row, level);
        headerIdentities.add(positiveIndex(row, 'aria-rowindex') ?? level);
      }
      const cells: Element[] = [];
      for (const cell of row.querySelectorAll(cellSelector)) {
        if (cell.closest('.ag-row, .ag-header-row') !== row || hidden(cell)) continue;
        if (physicalCells >= MAX_CELLS) { bound('已渲染单元格超过 200000 个安全上限。'); break; }
        physicalCells += 1;
        cells.push(cell);
      }
      rowCells.set(row, cells);
    }
    const knownHeaderRows = headerIdentities.size;
    const merged = new Map<string, GridRow>();
    const columnOrder = new Map<string, { index?: number; rank: number; order: number }>();
    const regionColumns = new Map<number, Set<string>>();
    const columnIndices = new Map<string, number>();
    const rowIndicesByKey = new Map<string, number>();
    let ambiguous = false;
    let uncertainRows = false;
    let sequence = 0;
    let physicalRow = 0;
    let expandedCells = 0;
    for (const row of domRows) {
      const index = positiveIndex(row, 'aria-rowindex');
      const key = row.getAttribute('row-id') || row.getAttribute('data-row-key');
      if (index !== undefined && key) rowIndicesByKey.set(key, index);
      for (const cell of rowCells.get(row) ?? []) {
        const columnIndex = positiveIndex(cell, 'aria-colindex');
        const id = cell.getAttribute('col-id') || cell.getAttribute('data-field');
        if (id && columnIndex !== undefined) {
          if (columnIndices.has(id) && columnIndices.get(id) !== columnIndex) ambiguous = true;
          if (columnIndex > MAX_COLUMNS) bound('列索引超过 1000 列安全上限。');
          else columnIndices.set(id, columnIndex);
        }
      }
    }
    for (const row of domRows) {
      const header = row.matches('.ag-header-row');
      const summary = !header && !!row.closest('.ag-floating-bottom, .ag-floating-top, .ag-pinned-bottom, .ag-pinned-top');
      const kind: RowMetadata['kind'] = header ? 'header' : summary ? 'summary' : 'data';
      const ariaIndex = positiveIndex(row, 'aria-rowindex');
      const rawIndex = row.getAttribute('row-index');
      const rowKey = row.getAttribute('row-id') || row.getAttribute('data-row-key') || undefined;
      const logicalIndex = ariaIndex ?? (rowKey === undefined ? undefined : rowIndicesByKey.get(rowKey))
        ?? (rawIndex !== null && /^\d+$/.test(rawIndex) ? knownHeaderRows + Number(rawIndex) + 1 : undefined);
      if (logicalIndex !== undefined && logicalIndex > MAX_ROWS) { bound('逻辑行索引超过 10000 行安全上限。'); continue; }
      const headerLevel = header ? headerLevels.get(row) : undefined;
      if (!header && !summary && logicalIndex === undefined && rowKey === undefined) uncertainRows = true;
      const identity = `${kind}:${logicalIndex !== undefined ? `index:${logicalIndex}`
        : rowKey !== undefined ? `key:${rowKey}` : header ? `level:${headerLevel}` : `unknown:${physicalRow++}`}`;
      const target = merged.get(identity) ?? {
        meta: { kind, index: logicalIndex, key: rowKey }, order: logicalIndex ?? headerLevel ?? sequence,
        values: new Map<string, string>(),
      };
      merged.set(identity, target);
      const cells = rowCells.get(row) ?? [];
      for (const cell of cells) {
        const id = cell.getAttribute('col-id') || cell.getAttribute('data-field');
        const index = positiveIndex(cell, 'aria-colindex') ?? (id ? columnIndices.get(id) : undefined);
        if (index !== undefined && index > MAX_COLUMNS) { bound('列索引超过 1000 列安全上限。'); continue; }
        if (index === undefined && !id) { ambiguous = true; continue; }
        const requestedSpan = positiveIndex(cell, 'aria-colspan') ?? 1;
        if (requestedSpan > MAX_COLUMNS || (index ?? 1) + requestedSpan - 1 > MAX_COLUMNS) {
          bound('列跨度超过 1000 列安全上限。');
        }
        const span = Math.min(requestedSpan, MAX_COLUMNS - (index ?? 1) + 1);
        if (span > 1 && index === undefined) { ambiguous = true; continue; }
        const rank = sectionRank(cell);
        const region = regionColumns.get(rank) ?? new Set<string>();
        regionColumns.set(rank, region);
        for (let offset = 0; offset < span; offset += 1) {
          const position = index === undefined ? undefined : index + offset;
          const key = position !== undefined ? `index:${position}` : `key:${id}`;
          region.add(key);
          if (!columnOrder.has(key)) {
            if (columnOrder.size >= MAX_COLUMNS) { bound('列数量超过 1000 列安全上限。'); break; }
            columnOrder.set(key, { index: position, rank, order: sequence++ });
          }
          if (!target.values.has(key) && expandedCells >= MAX_CELLS) {
            bound('跨度展开后的单元格超过 200000 个安全上限。'); break;
          }
          if (!target.values.has(key)) expandedCells += 1;
          const value = offset === 0 ? read(cell) : '';
          const previous = target.values.get(key);
          if (previous !== undefined && previous !== value && previous !== '' && value !== '') ambiguous = true;
          if (previous === undefined || previous === '') target.values.set(key, value);
        }
      }
    }
    if (columnOrder.size === 0 && !bounded) return null;
    const indexed = [...columnOrder.values()].every((column) => column.index !== undefined);
    const expectedColumnCount = positiveIndex(semanticGrid, 'aria-colcount');
    const highestColumn = Math.max(0, ...[...columnOrder.values()].map((column) => column.index ?? 0));
    if ((expectedColumnCount ?? 0) > MAX_COLUMNS) bound('声明的列数超过 1000 列安全上限。');
    const declaredVisibleColumnsMatch = expectedColumnCount !== undefined && expectedColumnCount === columnOrder.size;
    const keys = indexed && declaredVisibleColumnsMatch
      ? [...columnOrder].sort(([, left], [, right]) => left.index! - right.index!).map(([key]) => key)
      : indexed
      ? Array.from({ length: Math.min(MAX_COLUMNS, Math.max(highestColumn, expectedColumnCount ?? 0)) }, (_, index) => `index:${index + 1}`)
      : [...columnOrder].sort(([, left], [, right]) => left.rank - right.rank || left.order - right.order).map(([key]) => key);
    const kindOrder = { header: 0, data: 1, summary: 2 };
    let logicalRows = [...merged.values()].sort((left, right) => kindOrder[left.meta.kind] - kindOrder[right.meta.kind]
      || left.order - right.order);
    const outputRowLimit = keys.length > 0 ? Math.floor(MAX_CELLS / keys.length) : MAX_ROWS;
    if (logicalRows.length > outputRowLimit) {
      bound('规则矩阵超过 200000 个单元格安全上限。');
      logicalRows = logicalRows.slice(0, outputRowLimit);
    }
    const headerRows = logicalRows.filter((row) => row.meta.kind === 'header').length;
    const expectedRowCount = positiveIndex(semanticGrid, 'aria-rowcount');
    const rowIndices = logicalRows.filter((row) => row.meta.kind === 'data').flatMap((row) => row.meta.index === undefined ? [] : [row.meta.index]);
    const rowGaps = (rowIndices[0] ?? 1) > headerRows + 1
      || rowIndices.some((index, position) => position > 0 && index > rowIndices[position - 1]! + 1);
    const missingColumns = (indexed && keys.some((key) => !columnOrder.has(key)))
      || logicalRows.some((row) => keys.some((key) => !row.values.has(key)));
    const rowIncomplete = rowGaps || (expectedRowCount !== undefined && expectedRowCount > logicalRows.length)
      || semanticGrid.getAttribute('data-virtualized') === 'true' || element.getAttribute('data-virtualized') === 'true';
    const incomplete = rowIncomplete || missingColumns || (expectedColumnCount !== undefined && expectedColumnCount > keys.length);
    const virtualized = rowIncomplete && hasScrollableViewport(element);
    const warnings: string[] = [];
    if (ambiguous) warnings.push('固定区域存在列标识缺失或数据冲突，无法确认完整结构。');
    if (uncertainRows) warnings.push('数据行没有稳定索引或 row-id，无法合并固定区域或确认完整性。');
    if (element.querySelector('.ag-full-width-row')) warnings.push('展开详情行已排除。');
    if (incomplete) warnings.push('当前 DOM 未包含所有逻辑行或列。');
    warnings.push(...diagnostics.map((diagnostic) => diagnostic.message));
    const observedColumnIndices = indexed
      ? [...columnOrder.values()].flatMap((column) => column.index === undefined ? [] : [column.index]).sort((a, b) => a - b)
      : keys.map((_, index) => index + 1);
    const cloneColumnsRemoved = Math.max(0, [...regionColumns.values()].reduce((sum, region) => sum + region.size, 0) - columnOrder.size);
    const cells = [...rowCells].flatMap(([row, cells]) => cells.flatMap((cell) => {
      const id = cell.getAttribute('col-id') || cell.getAttribute('data-field');
      const logicalIndex = positiveIndex(cell, 'aria-colindex') ?? (id ? columnIndices.get(id) : undefined);
      const key = logicalIndex === undefined ? `key:${id}` : `index:${logicalIndex}`;
      const position = keys.indexOf(key);
      return position < 0 || (positiveIndex(cell, 'aria-colspan') ?? 1) !== 1
        ? [] : [{ element: cell, index: logicalIndex ?? position + 1, value: read(cell),
          kind: row.matches('.ag-header-row') ? 'header' as const
            : row.closest('.ag-floating-bottom, .ag-floating-top, .ag-pinned-bottom, .ag-pinned-top') ? 'summary' as const : 'data' as const }];
    }));
    const filtered = filterGridColumns(logicalRows.map((row) => keys.map((key) => row.values.get(key) ?? '')), {
      headerRows, complete: !bounded && !ambiguous && !uncertainRows && !incomplete, virtualized, missingColumns,
      expectedRowCount, expectedColumnCount, rowMeta: logicalRows.map((row) => row.meta), warnings, diagnostics,
      observedColumnIndices, cloneColumnsRemoved,
      unsupported_reason: bounded || ambiguous ? 'MALFORMED_STRUCTURE' : uncertainRows ? 'VIRTUAL_ROW_IDENTITY_UNCERTAIN'
        : incomplete ? 'INCOMPLETE_GRID' : undefined,
    }, cells, true, keys.map((key, position) => indexed ? Number(key.slice(6)) : position + 1));
    return makeCandidate(element, 'ag-grid', filtered.rows, filtered.metadata, 0.98);
  },
};
export default agGridAdapter;
