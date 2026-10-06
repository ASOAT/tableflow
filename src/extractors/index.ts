import { detectTables, type DetectionResult } from './detect';
import { discoverTables } from './discovery';
import type { EngineOptions } from '../shared/engine';
import type { Diagnostic, TableCandidate } from './types';
import { engineState } from '../shared/engine-state';
import { TableExtractionLimitError } from './html-table';
import type { ExtractorType } from './types';
import { diagnoseCandidate } from './diagnostics';

const frameworkTypes = new Set(['ant-design', 'element-plus', 'mui-data-grid', 'ag-grid']);

function boundedCandidate(element: Element, type: ExtractorType, error: TableExtractionLimitError): TableCandidate {
  return { id: '', type, confidence: 0.55, sourceElement: element, rows: error.preview,
    columns: error.preview[0]?.length ?? 0, metadata: { headerRows: 0, complete: false,
      unsupported_reason: 'MALFORMED_STRUCTURE', warnings: [error.message],
      diagnostics: [{ code: 'MALFORMED_STRUCTURE', message: error.message, certainty: 'confirmed', sourceElement: element }] } };
}

export function extractDetected(result: DetectionResult, options: EngineOptions = {}, includeDiagnostics = true): {
  tables: TableCandidate[]; diagnostics: Diagnostic[];
} {
  const diagnostics = [...result.diagnostics];
  const diagnosers = new Map<TableCandidate, typeof diagnoseCandidate>();
  const extracted = result.detections.map(({ extractor, element, source }) => {
    let candidate: TableCandidate | null;
    try { candidate = extractor.extract(element); }
    catch (error) {
      if (!(error instanceof TableExtractionLimitError)) throw error;
      candidate = boundedCandidate(element, extractor.type, error);
    }
    if (!candidate && extractor.type === 'aria-grid'
      && Number(element.getAttribute('aria-rowcount')) > 0
      && !diagnostics.some((diagnostic) => diagnostic.sourceElement === element)) {
      diagnostics.push({ code: 'UNSUPPORTED_STRUCTURE', certainty: 'confirmed', sourceElement: element,
        message: '此网格声明了数据行，但没有可读取的行列结构。请等待加载或检查页面使用的结构。' });
    }
    if (candidate) {
      candidate.metadata.source = source;
      diagnosers.set(candidate, extractor.diagnose);
    }
    return candidate;
  }).filter((candidate): candidate is TableCandidate => candidate !== null);
  const frameworks = extracted.filter((candidate) => frameworkTypes.has(candidate.type));
  const tables = extracted.filter((candidate) => {
    if (candidate.type === 'aria-grid' && extracted.some((other) => other.type === 'native-table'
      && other.sourceElement === candidate.sourceElement)) return false;
    if (!frameworkTypes.has(candidate.type) && frameworks.some((owner) =>
      owner.sourceElement === candidate.sourceElement || owner.sourceElement.contains(candidate.sourceElement))) return false;
    if (candidate.type === 'div-grid' && extracted.some((other) => other !== candidate
      && other.type !== 'div-grid' && candidate.sourceElement.contains(other.sourceElement))) return false;
    return true;
  });
  // Retain the previously supported EasyUI/jqGrid split HTML widgets.
  const roots = new Map<Document | ShadowRoot, string>();
  for (const { element, source } of result.detections) {
    const root = element.getRootNode() as Document | ShadowRoot;
    if ('querySelectorAll' in root) roots.set(root, source);
  }
  for (const [root, source] of roots) {
    for (const widget of root.querySelectorAll('.datagrid-view,.ui-jqgrid')) {
      let legacyTables;
      try { legacyTables = discoverTables(widget, { includeLayout: options.includeLowConfidence }); }
      catch (error) {
        if (!(error instanceof TableExtractionLimitError)) throw error;
        for (let index = tables.length - 1; index >= 0; index -= 1) {
          if (widget.contains(tables[index]!.sourceElement)) tables.splice(index, 1);
        }
        const candidate = boundedCandidate(widget, 'native-table', error);
        candidate.metadata.source = source;
        tables.push(candidate);
        continue;
      }
      for (const legacy of legacyTables) {
        if (!legacy.label) continue;
        const owner = legacy.anchor.closest('.datagrid-view,.ui-jqgrid-view,.ui-jqgrid') || legacy.anchor;
        for (let index = tables.length - 1; index >= 0; index -= 1) {
          if (owner.contains(tables[index]!.sourceElement)) tables.splice(index, 1);
        }
        const header = owner.querySelector<HTMLTableElement>('.datagrid-view2 .datagrid-header table')
          ?? owner.querySelector<HTMLTableElement>('.ui-jqgrid-hdiv:not(.frozen-div) table.ui-jqgrid-htable,.datagrid-header table');
        const headerRows = Math.min(header?.rows.length ?? 0, legacy.matrix.length);
        const totals = [owner, legacy.anchor].flatMap((element) =>
          ['aria-rowcount', 'data-row-count'].map((attribute) => Number(element.getAttribute(attribute))))
          .filter((value) => Number.isSafeInteger(value) && value > 0);
        const expectedRowCount = totals.length ? Math.max(...totals) : undefined;
        const incomplete = (expectedRowCount !== undefined && expectedRowCount > legacy.matrix.length)
          || owner.matches('[data-virtualized="true"]') || owner.querySelector('[data-virtualized="true"]') !== null;
        const warning: Diagnostic = { code: 'INCOMPLETE_GRID', certainty: 'confirmed', sourceElement: owner,
          message: '此拆分表格声明了未渲染数据；当前兼容规则不能保证全量，复制和导出已禁用。' };
        tables.push({ id: '', type: 'native-table', confidence: 0.9, title: legacy.label,
          rows: legacy.matrix, columns: legacy.matrix[0]?.length ?? 0, sourceElement: owner,
          metadata: { headerRows, complete: !incomplete, source: `${source} · ${legacy.label}`,
            ...(expectedRowCount === undefined ? {} : { expectedRowCount }),
            ...(incomplete ? { unsupported_reason: 'INCOMPLETE_GRID', diagnostics: [warning], warnings: [warning.message] } : {}) } });
      }
    }
  }
  const accepted = tables.filter((candidate) => candidate.rows.length > 0 && candidate.columns > 0
    && candidate.rows.some((row) => row.some(Boolean)) && (options.includeLowConfidence || candidate.confidence >= 0.4));
  accepted.sort((a, b) => {
    const relation = a.sourceElement.compareDocumentPosition(b.sourceElement);
    if (relation & 1) return 0;
    return relation & 4 ? -1 : relation & 2 ? 1 : 0;
  });
  for (const candidate of accepted) {
    let id = engineState.ids.get(candidate.sourceElement);
    if (!id) { id = `table-${++engineState.sequence}`; engineState.ids.set(candidate.sourceElement, id); }
    candidate.id = id;
    if (includeDiagnostics) candidate.diagnostics = (diagnosers.get(candidate) ?? diagnoseCandidate)(candidate, diagnostics);
  }
  return { tables: accepted, diagnostics: [...diagnostics,
    ...accepted.flatMap((candidate) => candidate.metadata.diagnostics ?? [])] };
}

export function extractTables(document: Document, options: EngineOptions = {}): {
  tables: TableCandidate[]; diagnostics: Diagnostic[];
} {
  return extractDetected(detectTables(document), options);
}

export { detectTables } from './detect';
export type { TableCandidate, Diagnostic } from './types';
