import type { TableCandidateView } from '../shared/engine';
import type { Completeness, ExtractionDiagnostics } from '../shared/diagnostics';
import { number, t } from '../shared/i18n';

/** Legacy snapshots are supported for compatibility stubs; production DTOs carry diagnostics. */
export function tableDiagnostics(table: TableCandidateView): ExtractionDiagnostics {
  if (table.diagnostics) return table.diagnostics;
  const summaries = table.metadata.rowMeta?.filter((row) => row.kind === 'summary').length ?? 0;
  const extraRows = table.metadata.headerRows + summaries;
  return {
    confidence: table.confidence,
    completeness: table.metadata.complete ? 'complete' : table.metadata.virtualized ? 'visible-only' : 'possibly-incomplete',
    extractedRows: Math.max(0, table.rows.length - extraRows),
    ...(table.metadata.expectedRowCount === undefined ? {} : { expectedRows: Math.max(0, table.metadata.expectedRowCount - extraRows) }),
    extractedColumns: table.columns,
    ...(table.metadata.expectedColumnCount === undefined ? {} : { expectedColumns: table.metadata.expectedColumnCount }),
    paginationDetected: false, virtualizationDetected: table.metadata.virtualized === true,
    warnings: table.metadata.complete ? [] : [{ code: table.metadata.virtualized ? 'VISIBLE_ROWS_ONLY' : 'POSSIBLY_INCOMPLETE' }],
    evidence: [{ source: 'legacy-snapshot', value: true, confidence: 0.5 }],
  };
}

export function completenessLabel(state: Completeness): string {
  return t(({ complete: 'complete', 'current-page': 'currentPage', 'visible-only': 'visibleOnly',
    'possibly-incomplete': 'possiblyIncomplete', unknown: 'unknown' } as const)[state]);
}

export function completenessNotice(diagnostics: ExtractionDiagnostics): string {
  const count = number(diagnostics.extractedRows);
  const expected = diagnostics.expectedRows === undefined ? undefined : number(diagnostics.expectedRows);
  switch (diagnostics.completeness) {
    case 'complete': return t('completeNotice');
    case 'current-page': return t('pageNotice', { rows: count }) + (expected ? t('pageTotal', { rows: expected }) : t('pageOther'));
    case 'visible-only': return t('visibleNotice', { rows: count });
    case 'possibly-incomplete': return t('possibleNotice', { rows: count, expected: expected ? t('expectedSuffix', { rows: expected }) : '' });
    case 'unknown': return t('unknownNotice', { rows: count });
  }
}

export function exportBlocked(table: TableCandidateView): boolean {
  const reason = table.metadata.unsupported_reason;
  return table.rows.length === 0 || table.columns === 0 || reason === 'MALFORMED_STRUCTURE' || reason === 'ABORTED'
    || tableDiagnostics(table).warnings.some((warning) => warning.code === 'EXTRACTION_FAILED');
}

export function exportNeedsConfirmation(table: TableCandidateView): boolean {
  const state = tableDiagnostics(table).completeness;
  return state !== 'complete' && state !== 'current-page';
}
