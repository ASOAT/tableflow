import { detectTables, extractDetected, extractTables } from '../extractors';
import { collectVirtualTable } from '../extractors/virtualized/virtualScroller';
import type { VirtualLimits } from '../extractors/virtualized/config';
import { candidateView, diagnosticView, type EngineOptions, type EngineSnapshot, type TableCandidateView } from '../shared/engine';
import { toCsv, toTsv } from '../exporters/delimited';
import { engineState } from '../shared/engine-state';
import { diagnoseCandidate } from '../extractors/diagnostics';
import { createDebugReport, type DebugReport } from '../shared/debug-report';
import { holdSnapshot, validateSnapshot } from './snapshot';
import type { CollectionProgress } from '../shared/snapshot';

export { validateSnapshot } from './snapshot';

export function inspectTables(options: EngineOptions = {}): EngineSnapshot {
  const result = extractTables(document, options);
  return { ...holdSnapshot(result.tables, options), diagnostics: result.diagnostics.map(diagnosticView) };
}

export async function collectTable(id: string, limits?: Partial<VirtualLimits>): Promise<TableCandidateView> {
  if (engineState.collection) throw new Error('已有表格正在收集，请先取消或等待完成。');
  const snapshot = engineState.snapshot;
  if (!snapshot || !validateSnapshot(snapshot.id, id).valid) throw new Error('页面内容已变化，请重新扫描。');
  const original = extractTables(document, snapshot.options).tables.find((candidate) => candidate.id === id);
  if (!original?.sourceElement.isConnected) throw new Error('表格已变化，请重新扫描。');
  const record = snapshot.tables.get(id)!;
  const samePage = () => engineState.snapshot === snapshot && snapshot.document === document
    && snapshot.pageUrl === document.URL && record.ownerDocument.URL === record.ownerUrl;
  if (!original.metadata.virtualized || original.metadata.unsupported_reason === 'MALFORMED_STRUCTURE') {
    throw new Error('此结构无法通过纵向滚动收集完整行。');
  }
  const controller = new AbortController();
  engineState.collection = controller;
  engineState.collectionProgress = { rows: 0, iterations: 0 };
  try {
    const scope = (candidate: typeof original) => {
      if (candidate.metadata.pageExpectedRows !== undefined) {
        const summaries = candidate.metadata.rowMeta?.filter((row) => row.kind === 'summary').length ?? 0;
        candidate.metadata.expectedRowCount = candidate.metadata.pageExpectedRows + candidate.metadata.headerRows + summaries;
      }
      return candidate;
    };
    const collected = await collectVirtualTable(scope(original), () => {
      if (!samePage()) return null;
      const candidate = extractTables(document, snapshot.options).tables.find((entry) => entry.sourceElement === original.sourceElement);
      return candidate ? scope(candidate) : null;
    },
    { limits, signal: controller.signal, onProgress: (rows, iterations) => {
      engineState.collectionProgress = { rows, iterations };
    } });
    if (!samePage()) throw new Error('页面内容已变化，请重新扫描。');
    collected.diagnostics = diagnoseCandidate(collected);
    const observed = extractTables(document, snapshot.options).tables
      .filter((entry) => entry.sourceElement === original.sourceElement);
    if (!observed.length && collected.metadata.unsupported_reason === 'ABORTED') {
      // Preserve the reported partial failure, but an unmounted source cannot authorize export.
      engineState.snapshot = undefined;
      return candidateView(collected);
    }
    if (!observed.length) throw new Error('页面内容已变化，请重新扫描。');
    return holdSnapshot([collected], snapshot.options, observed).tables[0]!;
  } finally { engineState.collection = undefined; }
}

export function cancelCollection(): void { engineState.collection?.abort(); }

export function getCollectionProgress(): CollectionProgress {
  return { ...engineState.collectionProgress ?? { rows: 0, iterations: 0 }, running: engineState.collection !== undefined };
}

export function generateDebugReport(id: string): DebugReport {
  const candidate = extractTables(document, { includeLowConfidence: true }).tables.find((entry) => entry.id === id);
  if (!candidate) throw new Error('表格已变化，请重新扫描。');
  return createDebugReport(candidate, chrome.runtime.getManifest().version, document.URL, navigator.userAgent);
}

export function serializeRows(rows: string[][], format: 'csv' | 'tsv'): string {
  return format === 'csv' ? toCsv(rows) : toTsv(rows);
}

export function benchmarkTables(): {
  detectMs: number; extractMs: number; diagnosticsMs: number; csvMs: number; tsvMs: number; rows: number; columns: number;
} {
  let started = performance.now();
  const detected = detectTables(document);
  const detectMs = performance.now() - started;
  started = performance.now();
  const tables = extractDetected(detected, {}, false).tables;
  const extractMs = performance.now() - started;
  started = performance.now();
  tables.forEach((table) => { table.diagnostics = diagnoseCandidate(table, detected.diagnostics); });
  const diagnosticsMs = performance.now() - started;
  started = performance.now();
  tables.forEach((table) => toCsv(table.rows));
  const csvMs = performance.now() - started;
  started = performance.now();
  tables.forEach((table) => toTsv(table.rows));
  return { detectMs, extractMs, diagnosticsMs, csvMs, tsvMs: performance.now() - started,
    rows: tables.reduce((count, table) => count + table.rows.length, 0),
    columns: Math.max(0, ...tables.map((table) => table.columns)) };
}
