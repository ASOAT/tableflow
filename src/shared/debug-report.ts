import type { ExtractionDiagnostics } from './diagnostics';
import type { ExtractorType, TableCandidate } from '../extractors/types';
export interface DebugReport {
  version: string;
  browser: string;
  origin: string;
  extractor: ExtractorType;
  adapter: string;
  confidence: number;
  diagnostics: ExtractionDiagnostics;
  structure: { rows: number; columns: number; headerRows: number; roles: Record<string, number>; openShadow: boolean };
}

/** Strict allowlist: never copy page text, attributes, HTML, storage, inputs or URLs with paths. */
export function createDebugReport(candidate: TableCandidate, version: string, pageUrl: string, userAgent: string): DebugReport {
  const url = new URL(pageUrl);
  const roles: Record<string, number> = {};
  const allowed = ['table', 'grid', 'treegrid', 'row', 'columnheader', 'rowheader', 'cell', 'gridcell'];
  for (const role of allowed) roles[role] = candidate.sourceElement.querySelectorAll(`[role="${role}"]`).length;
  const match = userAgent.match(/(?:Edg|Chrome|Chromium)\/[\d.]+/);
  if (!candidate.diagnostics) throw new Error('完整性诊断尚未生成。');
  // Evidence/warning metadata are generated numbers and codes; no arbitrary strings are retained.
  const diagnostics: ExtractionDiagnostics = { ...candidate.diagnostics,
    warnings: candidate.diagnostics.warnings.map(({ code, metadata }) => ({ code,
      ...(metadata ? { metadata: Object.fromEntries(Object.entries(metadata).filter(([, value]) => typeof value !== 'string')) } : {}) })),
    evidence: candidate.diagnostics.evidence.filter((entry) => typeof entry.value !== 'string').map((entry) => ({ ...entry })) };
  return { version, browser: match?.[0] ?? 'Chromium', origin: /^https?:$/.test(url.protocol) ? url.origin : url.protocol,
    extractor: candidate.type, adapter: candidate.type, confidence: candidate.confidence, diagnostics,
    structure: { rows: candidate.rows.length, columns: candidate.columns, headerRows: candidate.metadata.headerRows,
      roles, openShadow: candidate.sourceElement.getRootNode().nodeType === 11 } };
}
