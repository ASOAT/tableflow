export type TableMatrix = string[][];

export interface ExtractedTable {
  /** One-based index in document order. */
  id: number;
  rowCount: number;
  columnCount: number;
  preview: string;
  matrix: TableMatrix;
  source?: string;
}

export interface ScanOptions {
  includeLayout?: boolean;
}

export interface ScanResult {
  tables: ExtractedTable[];
  inaccessibleFrameCount: number;
}
