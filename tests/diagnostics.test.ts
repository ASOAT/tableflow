import { afterEach, describe, expect, it } from 'vitest';
import { diagnoseCandidate } from '../src/extractors/diagnostics';
import { createDebugReport } from '../src/shared/debug-report';
import { AdapterRegistry } from '../src/extractors/registry';
import { nativeTableExtractor } from '../src/extractors/nativeTableExtractor';
import { extractDetected } from '../src/extractors';
import type { TableCandidate } from '../src/extractors/types';

function candidate(overrides: Partial<TableCandidate> = {}): TableCandidate {
  const element = document.createElement('div'); document.body.append(element);
  return { id: 'test', type: 'aria-grid', confidence: 0.94, sourceElement: element,
    rows: [['姓名', '金额'], ['中文', '¥1,299.00']], columns: 2,
    metadata: { headerRows: 1, complete: true, rowMeta: [{ kind: 'header' }, { kind: 'data', index: 2 }] }, ...overrides };
}
afterEach(() => document.body.replaceChildren());
describe('completeness evidence', () => {
  it('counts business records separately from headers and summary', () => {
    const table = candidate(); table.rows.push(['汇总', '1']); table.metadata.rowMeta!.push({ kind: 'summary' });
    table.metadata.expectedRowCount = 3;
    table.sourceElement.setAttribute('aria-rowcount', '3');
    expect(diagnoseCandidate(table)).toMatchObject({ completeness: 'complete', extractedRows: 1, expectedRows: 1 });
    expect(diagnoseCandidate(table).evidence).toContainEqual({ source: 'aria-rowcount', value: 3, confidence: 1 });
  });
  it('distinguishes current-page scope from total and ignores unrelated year text', () => {
    const table = candidate({ type: 'ant-design' }); table.sourceElement.className = 'ant-table-wrapper';
    table.sourceElement.innerHTML = '<div>2026</div><ul class="ant-pagination"><li class="ant-pagination-total-text">总计 120 条</li><li class="ant-pagination-item-active">1</li><button>下一页</button><span class="ant-select-selection-item">20 条/页</span></ul>';
    table.rows = [['姓名', '金额'], ...Array.from({ length: 20 }, () => ['中文', '1'])];
    const diagnosis = diagnoseCandidate(table);
    expect(diagnosis).toMatchObject({ completeness: 'current-page', extractedRows: 20, expectedRows: 120, paginationDetected: true });
    expect(diagnosis.warnings.map((entry) => entry.code)).toContain('PAGINATION_DETECTED');
    expect(diagnosis.evidence).toContainEqual({ source: 'antd-pagination-total', value: 120, confidence: 0.98 });
  });
  it('does not infer total from an unlabelled number in pagination or elsewhere', () => {
    const table = candidate({ type: 'ant-design' });
    table.sourceElement.innerHTML = '<span>2026</span><ul class="ant-pagination"><li class="ant-pagination-total-text">2026</li><button>下一页</button></ul>';
    expect(diagnoseCandidate(table).expectedRows).toBeUndefined();
  });
  it('reports declared 2000 data rows with only 50 rendered as visible-only', () => {
    const table = candidate(); table.rows = [['姓名', '金额'], ...Array.from({ length: 50 }, () => ['中文', '1'])];
    table.metadata = { headerRows: 1, complete: false, expectedRowCount: 2001, virtualized: true };
    const diagnosis = diagnoseCandidate(table);
    expect(diagnosis).toMatchObject({ completeness: 'visible-only', extractedRows: 50, expectedRows: 2000 });
    expect(diagnosis.warnings.map((entry) => entry.code)).toContain('ROW_COUNT_MISMATCH');
  });
  it('reports actual 8 of 20 observed columns instead of treating padded blanks as rendered', () => {
    const table = candidate(); table.columns = 20;
    table.metadata = { headerRows: 1, complete: false, expectedColumnCount: 20,
      observedColumnIndices: [1, 2, 3, 4, 5, 6, 7, 8], missingColumns: true };
    const diagnosis = diagnoseCandidate(table);
    expect(diagnosis).toMatchObject({ extractedColumns: 8, expectedColumns: 20, completeness: 'possibly-incomplete' });
    expect(diagnosis.warnings).toContainEqual({ code: 'COLUMN_COUNT_MISMATCH', metadata: { expected: 20, extracted: 8 } });
  });
  it('subtracts only verified controls from expected business columns', () => {
    const table = candidate(); table.metadata.expectedColumnCount = 3;
    table.metadata.controlColumnIndices = [1]; table.metadata.observedColumnIndices = [2, 3];
    const diagnosis = diagnoseCandidate(table);
    expect(diagnosis.expectedColumns).toBe(2);
    expect(diagnosis.warnings.map((entry) => entry.code)).toContain('CONTROL_COLUMNS_IGNORED');
  });
  it('keeps gaps, loading and external inaccessible roots out of the complete state', () => {
    const table = candidate(); table.rows.push(['另行', '2']);
    table.metadata.rowMeta!.push({ kind: 'data', index: 120 });
    expect(diagnoseCandidate(table).completeness).toBe('possibly-incomplete');
    table.sourceElement.setAttribute('aria-busy', 'true');
    expect(diagnoseCandidate(table).warnings.map((entry) => entry.code)).toContain('LOADING');
    expect(diagnoseCandidate(candidate(), [{ code: 'CROSS_ORIGIN_FRAME_PERMISSION', message: 'x', certainty: 'confirmed' }]).warnings
      .map((entry) => entry.code)).toContain('CROSS_ORIGIN_FRAME');
  });
  it('retains unknown for unverified heuristic grids and low confidence', () => {
    expect(diagnoseCandidate(candidate({ type: 'div-grid' })).completeness).toBe('unknown');
    expect(diagnoseCandidate(candidate({ confidence: 0.3 })).warnings.map((entry) => entry.code)).toContain('LOW_CONFIDENCE');
  });
  it('accepts safe page-scoped rows despite a dataset-wide ARIA mismatch', () => {
    const table = candidate({ type: 'mui-data-grid' });
    table.sourceElement.innerHTML = '<div class="MuiTablePagination-root"><button>Next page</button><span class="MuiTablePagination-displayedRows">1–20 of 120</span></div>';
    table.rows = [['姓名', '金额'], ...Array.from({ length: 20 }, () => ['中文', '1'])];
    table.metadata.expectedRowCount = 121; table.metadata.complete = false;
    expect(diagnoseCandidate(table)).toMatchObject({ completeness: 'current-page', expectedRows: 120, extractedRows: 20 });
  });
  it('does not let verified pagination conceal a business control without readable text', () => {
    const table = candidate({ type: 'mui-data-grid' });
    table.sourceElement.innerHTML = '<div class="MuiTablePagination-root"><button>Next page</button><span class="MuiTablePagination-displayedRows">1–1 of 120</span></div>';
    table.metadata.expectedRowCount = 121;
    table.metadata.complete = false;
    table.metadata.ambiguousControlColumnIndices = [2];
    const diagnosis = diagnoseCandidate(table);
    expect(diagnosis).toMatchObject({ completeness: 'unknown', extractedRows: 1, expectedRows: 120 });
    expect(diagnosis.warnings).toContainEqual({ code: 'UNKNOWN_GRID_STRUCTURE', metadata: { reason: 'unreadable-business-control', columns: [2] } });
  });
});
describe('local debug report and registry', () => {
  it('exports only whitelisted structural facts and strips URL credentials/query/path and page content', () => {
    const table = candidate(); table.sourceElement.innerHTML = '<input value="secret-input"><span role="gridcell">private-content</span>';
    table.diagnostics = diagnoseCandidate(table);
    table.diagnostics.evidence.push({ source: 'unsafe-probe', value: 'secret-token', confidence: 0 });
    const report = createDebugReport(table, '0.4.0', 'https://user:password@example.com/private?token=secret-token#value', 'Chrome/153.0.0.0');
    expect(report.origin).toBe('https://example.com');
    const json = JSON.stringify(report);
    for (const secret of ['password', 'secret-token', 'private-content', 'secret-input', '¥1,299.00', '/private', 'cookie', 'localStorage']) expect(json).not.toContain(secret);
  });
  it('registers bundled adapters with stable IDs and rejects duplicate IDs', () => {
    const registry = new AdapterRegistry();
    const adapter = { ...nativeTableExtractor, id: 'native-table', name: 'Native', diagnose: diagnoseCandidate };
    registry.registerAdapter(adapter); expect(registry.all()).toHaveLength(1);
    expect(() => registry.registerAdapter(adapter)).toThrow('unique');
  });
  it('uses the detected bundled adapter diagnosis hook in the extraction engine', () => {
    const table = candidate({ type: 'native-table' });
    const diagnosis = { ...diagnoseCandidate(table), completeness: 'unknown' as const };
    const adapter = { ...nativeTableExtractor, id: 'local-adapter', name: 'Local',
      extract: () => table, diagnose: () => diagnosis };
    const result = extractDetected({ diagnostics: [], detections: [{ extractor: adapter,
      element: table.sourceElement, source: 'document' }] });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.diagnostics).toBe(diagnosis);
  });
});
