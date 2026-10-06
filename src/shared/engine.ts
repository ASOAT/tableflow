import type { CandidateMetadata, Diagnostic, DiagnosticCode, ExtractorType, TableCandidate } from '../extractors/types';
import type { ExtractionDiagnostics } from './diagnostics';
import { diagnoseCandidate } from '../extractors/diagnostics';

export type DiagnosticView = Omit<Diagnostic, 'sourceElement'> & { unsupported_reason: DiagnosticCode };
export type CandidateMetadataView = Omit<CandidateMetadata, 'diagnostics'> & { diagnostics?: DiagnosticView[] };
export interface TableCandidateView {
  id: string;
  type: ExtractorType;
  confidence: number;
  title?: string;
  rows: string[][];
  columns: number;
  metadata: CandidateMetadataView;
  diagnostics: ExtractionDiagnostics;
  snapshotId?: string;
}
export interface EngineSnapshot { tables: TableCandidateView[]; diagnostics: DiagnosticView[]; snapshotId?: string; }
export interface EngineOptions { includeLowConfidence?: boolean; }

export function diagnosticView(diagnostic: Diagnostic): DiagnosticView {
  return { code: diagnostic.code, unsupported_reason: diagnostic.code, message: diagnostic.message, certainty: diagnostic.certainty };
}
export function candidateView(candidate: TableCandidate): TableCandidateView {
  const { id, type, confidence, title, rows, columns, metadata } = candidate;
  return { id, type, confidence, ...(title ? { title } : {}), rows, columns,
    diagnostics: candidate.diagnostics ?? diagnoseCandidate(candidate),
    metadata: { ...metadata, diagnostics: metadata.diagnostics?.map(diagnosticView) } };
}
