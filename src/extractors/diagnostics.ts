import { createVisibilityCheck, hasScrollableViewport } from './normalize';
import type { Diagnostic, TableCandidate } from './types';
import type { DiagnosticEvidence, DiagnosticWarning, ExtractionDiagnostics, WarningCode } from '../shared/diagnostics';

interface Pagination { detected: boolean; total?: number; pageRows?: number; current?: number; evidence: DiagnosticEvidence[]; }
const numeric = (text: string | null | undefined): number | undefined => {
  if (!text || !/^\d[\d,\s]*$/.test(text.trim())) return undefined;
  const value = Number(text.replace(/[,\s]/g, ''));
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

function paginationScope(candidate: TableCandidate): Element {
  const own = candidate.sourceElement;
  if (candidate.type === 'ant-design') return own.closest('.ant-table-wrapper') ?? own;
  if (candidate.type === 'ag-grid') return own.closest('.ag-root-wrapper') ?? own;
  if (candidate.type === 'element-plus') {
    let parent = own.parentElement;
    for (let depth = 0; parent && depth < 2; depth += 1, parent = parent.parentElement) {
      if (parent.querySelector('.el-pagination') && parent.querySelectorAll('.el-table').length === 1) return parent;
    }
  }
  return own;
}

/** Read totals only within a verified component's semantic pagination controls. */
export function diagnosePagination(candidate: TableCandidate): Pagination {
  const scope = paginationScope(candidate);
  const selector = candidate.type === 'ant-design' ? '.ant-pagination'
    : candidate.type === 'element-plus' ? '.el-pagination'
      : candidate.type === 'mui-data-grid' ? '.MuiTablePagination-root'
        : candidate.type === 'ag-grid' ? '.ag-paging-panel' : '';
  if (!selector) return { detected: false, evidence: [] };
  const pager = scope.matches(selector) ? scope : scope.querySelector(selector);
  if (!pager || createVisibilityCheck()(pager)
    || !pager.querySelector('button,[role="button"],li,[role="combobox"]')) return { detected: false, evidence: [] };
  const evidence: DiagnosticEvidence[] = [{ source: 'pagination-controls', value: true, confidence: 0.95 }];
  const totalNode = pager.querySelector('.ant-pagination-total-text,.el-pagination__total');
  const labeledTotal = totalNode?.textContent?.match(/(?:共|总计|总共|total\s*[:：]?)\s*([\d,]+)\s*(?:条|行|items?|rows?)?/i);
  let total = numeric(labeledTotal?.[1]);
  if (total !== undefined) evidence.push({ source: candidate.type === 'ant-design' ? 'antd-pagination-total' : 'element-pagination-total', value: total, confidence: 0.98 });
  const range = pager.querySelector('.MuiTablePagination-displayedRows,.ag-paging-row-summary-panel')?.textContent
    ?.replace(/\s+/g, ' ').trim().match(/^([\d,]+)\s*(?:[–-]|to)\s*([\d,]+)\s*(?:of|\/|共)\s*([\d,]+)\s*(?:条|行)?$/i);
  let pageRows: number | undefined;
  let current: number | undefined;
  if (range) {
    const from = numeric(range[1]); const to = numeric(range[2]); total = numeric(range[3]);
    if (from !== undefined && to !== undefined && to >= from && from > 0) pageRows = to - from + 1;
    if (total !== undefined) evidence.push({ source: candidate.type === 'mui-data-grid' ? 'mui-pagination-range' : 'ag-pagination-range', value: total, confidence: 0.98 });
    if (pageRows) current = Math.floor(((from ?? 1) - 1) / pageRows) + 1;
  }
  const pageSizeText = pager.querySelector('.ant-select-selection-item,.el-pagination__sizes,.MuiTablePagination-select')?.textContent ?? '';
  const pageSize = numeric(pageSizeText.match(/(\d+)\s*(?:条\/页|\/\s*page|\/页|rows)/i)?.[1]
    ?? (candidate.type === 'mui-data-grid' ? pageSizeText.trim() : undefined));
  current ??= numeric(pager.querySelector('.ant-pagination-item-active,.el-pager .is-active,[aria-current="page"]')?.textContent);
  if (pageRows === undefined && pageSize !== undefined && current !== undefined && total !== undefined) {
    pageRows = Math.max(0, Math.min(pageSize, total - (current - 1) * pageSize));
  }
  if (pageRows !== undefined) evidence.push({ source: 'pagination-page-rows', value: pageRows, confidence: 0.95 });
  if (current !== undefined) evidence.push({ source: 'pagination-current-page', value: current, confidence: 0.95 });
  return { detected: true, total, pageRows, current, evidence };
}

export function diagnoseCandidate(candidate: TableCandidate, external: Diagnostic[] = []): ExtractionDiagnostics {
  const { metadata, rows } = candidate;
  const warnings: DiagnosticWarning[] = [];
  const evidence: DiagnosticEvidence[] = [];
  const warn = (code: WarningCode, info?: DiagnosticWarning['metadata']) => {
    if (!warnings.some((entry) => entry.code === code)) warnings.push({ code, ...(info ? { metadata: info } : {}) });
  };
  const summaryRows = metadata.rowMeta?.filter((row) => row.kind === 'summary').length ?? 0;
  const extractedRows = Math.max(0, rows.length - metadata.headerRows - summaryRows);
  const controlCount = metadata.controlColumnIndices?.length ?? 0;
  const extractedColumns = metadata.observedColumnIndices?.length ?? candidate.columns;
  const expectedColumns = metadata.expectedColumnCount === undefined ? undefined
    : Math.max(0, metadata.expectedColumnCount - controlCount);
  const pagination = diagnosePagination(candidate);
  const declaredRows = metadata.expectedRowCount === undefined ? undefined
    : Math.max(0, metadata.expectedRowCount - metadata.headerRows - summaryRows);
  const expectedRows = pagination.total ?? declaredRows;
  const scopeRows = pagination.pageRows ?? (pagination.detected ? undefined : declaredRows);
  metadata.pageExpectedRows = pagination.pageRows;
  evidence.push({ source: 'rendered-data-rows', value: extractedRows, confidence: 1 },
    { source: 'rendered-business-columns', value: extractedColumns, confidence: 1 });
  if (declaredRows !== undefined) {
    const declaredElement = candidate.sourceElement.hasAttribute('aria-rowcount') ? candidate.sourceElement
      : candidate.sourceElement.querySelector('[role="grid"][aria-rowcount],[role="treegrid"][aria-rowcount],[role="table"][aria-rowcount]');
    const rawCount = Number(declaredElement?.getAttribute('aria-rowcount'));
    if (Number.isSafeInteger(rawCount) && rawCount > 0) evidence.push({ source: 'aria-rowcount', value: rawCount, confidence: 1 });
    evidence.push({ source: 'expected-data-rows-in-scope', value: declaredRows, confidence: 1 });
  }
  if (expectedColumns !== undefined) evidence.push({ source: 'aria-colcount', value: expectedColumns, confidence: 1 });
  evidence.push(...pagination.evidence);
  const actualIndices = metadata.rowMeta?.filter((row) => row.kind === 'data').flatMap((row) => row.index === undefined ? [] : [row.index]) ?? [];
  const sortedIndices = [...new Set(actualIndices)].sort((a, b) => a - b);
  const rowGaps = sortedIndices.some((index, position) => position > 0 && index !== sortedIndices[position - 1]! + 1);
  if (sortedIndices.length) evidence.push({ source: 'logical-row-index-range',
    value: [sortedIndices[0]!, sortedIndices.at(-1)!, sortedIndices.length], confidence: 1 });
  const scroll = hasScrollableViewport(candidate.sourceElement);
  if (scroll) evidence.push({ source: 'measured-scroll-viewport', value: true, confidence: 0.9 });
  if (metadata.collectionVerified) evidence.push({ source: 'bounded-collection-contiguous-and-count-verified', value: true, confidence: 0.98 });
  const virtualizationDetected = metadata.virtualized === true;
  const hidden = createVisibilityCheck();
  const loading = metadata.loading === true || candidate.sourceElement.matches('[aria-busy="true"]')
    || Array.from(candidate.sourceElement.querySelectorAll('[aria-busy="true"],.ant-spin-spinning,.el-loading-mask,.MuiDataGrid-loadingOverlay,.ag-overlay-loading-center'))
      .some((element) => !hidden(element));
  const columnMissing = metadata.missingColumns === true || (expectedColumns !== undefined && extractedColumns < expectedColumns);
  const rowMissing = scopeRows !== undefined && extractedRows !== scopeRows;
  let completeness: ExtractionDiagnostics['completeness'] = 'complete';
  if (pagination.detected) {
    warn('PAGINATION_DETECTED', { extracted: extractedRows, ...(pagination.total === undefined ? {} : { total: pagination.total }) });
    completeness = 'current-page';
    if (expectedRows !== undefined && expectedRows === extractedRows && !rowMissing && !columnMissing) completeness = 'complete';
  }
  if (expectedRows !== undefined && expectedRows !== extractedRows) warn('ROW_COUNT_MISMATCH', { expected: expectedRows, extracted: extractedRows });
  if (columnMissing) {
    warn('COLUMN_COUNT_MISMATCH', { expected: expectedColumns ?? candidate.columns, extracted: extractedColumns });
    completeness = 'possibly-incomplete';
  }
  if (virtualizationDetected) {
    warn('VIRTUALIZATION_DETECTED');
    if (!metadata.collectionVerified && (rowMissing || !metadata.complete)) {
      completeness = columnMissing ? 'possibly-incomplete' : 'visible-only'; warn('VISIBLE_ROWS_ONLY');
    }
  }
  const pageScopeVerified = pagination.detected && pagination.pageRows !== undefined
    && extractedRows === pagination.pageRows && !rowGaps && !columnMissing
    && metadata.unsupported_reason !== 'MALFORMED_STRUCTURE' && !loading;
  if ((rowMissing || rowGaps || (!metadata.complete && !pageScopeVerified)) && completeness !== 'visible-only') completeness = 'possibly-incomplete';
  if (candidate.type === 'div-grid' && expectedRows === undefined) completeness = 'unknown';
  if (candidate.confidence < 0.4) { warn('LOW_CONFIDENCE'); completeness = 'unknown'; }
  if (metadata.cloneColumnsRemoved) warn('FIXED_COLUMN_CLONES_REMOVED', { count: metadata.cloneColumnsRemoved });
  if (controlCount) warn('CONTROL_COLUMNS_IGNORED', { count: controlCount });
  for (const entry of external) {
    if (entry.code === 'CROSS_ORIGIN_FRAME_PERMISSION') { warn('CROSS_ORIGIN_FRAME'); completeness = 'possibly-incomplete'; }
    if (entry.code === 'CLOSED_SHADOW_ROOT') { warn('CLOSED_SHADOW_ROOT'); completeness = 'possibly-incomplete'; }
  }
  if (loading) { warn('LOADING'); completeness = 'possibly-incomplete'; }
  const reason = metadata.unsupported_reason;
  if (reason === 'MALFORMED_STRUCTURE') warn('EXTRACTION_FAILED');
  if (reason === 'ABORTED') warn('COLLECTION_ABORTED');
  if (reason === 'ROW_LIMIT' || reason === 'ITERATION_LIMIT' || reason === 'TIMEOUT') warn('COLLECTION_LIMIT');
  if ((reason === 'UNSUPPORTED_STRUCTURE' || reason === 'VIRTUAL_ROW_IDENTITY_UNCERTAIN')
    && !metadata.ambiguousControlColumnIndices?.length) warn('UNKNOWN_GRID_STRUCTURE');
  if (metadata.ambiguousControlColumnIndices?.length) {
    completeness = 'unknown';
    warn('UNKNOWN_GRID_STRUCTURE', { reason: 'unreadable-business-control', columns: metadata.ambiguousControlColumnIndices });
    evidence.push({ source: 'business-control-without-readable-value', value: metadata.ambiguousControlColumnIndices, confidence: 1 });
  }
  if (completeness === 'possibly-incomplete') warn('POSSIBLY_INCOMPLETE');
  if (completeness === 'unknown') warn('UNKNOWN_GRID_STRUCTURE');
  return { confidence: candidate.confidence, completeness, extractedRows, extractedColumns,
    ...(expectedRows === undefined ? {} : { expectedRows }), ...(expectedColumns === undefined ? {} : { expectedColumns }),
    paginationDetected: pagination.detected, virtualizationDetected, warnings, evidence };
}
