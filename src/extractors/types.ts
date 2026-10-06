import type { ExtractionDiagnostics } from '../shared/diagnostics';

export type CellValue = string;
export type ExtractorType = 'native-table' | 'aria-grid' | 'div-grid' | 'ant-design' | 'element-plus' | 'mui-data-grid' | 'ag-grid';
export type DiagnosticCode = 'CLOSED_SHADOW_ROOT' | 'CROSS_ORIGIN_FRAME_PERMISSION' | 'INCOMPLETE_GRID'
  | 'VIRTUAL_ROW_IDENTITY_UNCERTAIN' | 'ROW_LIMIT' | 'ITERATION_LIMIT' | 'TIMEOUT' | 'ABORTED'
  | 'UNSUPPORTED_STRUCTURE' | 'MALFORMED_STRUCTURE';

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  certainty: 'confirmed' | 'possible';
  sourceElement?: Element;
}

export interface RowMetadata {
  kind: 'header' | 'data' | 'summary';
  /** One-based logical row index when supplied by the page. */
  index?: number;
  key?: string;
}

export interface CandidateMetadata {
  headerRows: number;
  complete: boolean;
  virtualized?: boolean;
  /** A logical column lacks a DOM cell; vertical scrolling cannot fill it. */
  missingColumns?: boolean;
  expectedRowCount?: number;
  expectedColumnCount?: number;
  rowMeta?: RowMetadata[];
  warnings?: string[];
  diagnostics?: Diagnostic[];
  unsupported_reason?: DiagnosticCode;
  source?: string;
  controlColumnIndices?: number[];
  /** Original logical positions whose business checkbox state has no readable value. */
  ambiguousControlColumnIndices?: number[];
  observedColumnIndices?: number[];
  cloneColumnsRemoved?: number;
  pageExpectedRows?: number;
  loading?: boolean;
  collectionVerified?: boolean;
}

export interface TableCandidate {
  id: string;
  type: ExtractorType;
  confidence: number;
  title?: string;
  rows: CellValue[][];
  columns: number;
  sourceElement: Element;
  metadata: CandidateMetadata;
  diagnostics?: ExtractionDiagnostics;
}

export interface Extractor {
  type: ExtractorType;
  priority: number;
  detect(root: ParentNode): Element[];
  extract(element: Element): TableCandidate | null;
}
