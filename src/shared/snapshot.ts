import type { EngineOptions } from './engine';

export type SnapshotInvalidReason = 'STALE_SNAPSHOT' | 'PAGE_CHANGED' | 'TABLE_CHANGED'
  | 'TABLE_REMOVED' | 'COLLECTION_RUNNING';
export interface SnapshotValidation {
  valid: boolean;
  reason?: SnapshotInvalidReason;
}
export interface CollectionProgress {
  rows: number;
  iterations: number;
  running: boolean;
}

// Only this transient isolated-world state retains DOM and page identity. Never serialize it.
export interface SnapshotRecord {
  sourceElement: Element;
  ownerDocument: Document;
  ownerUrl: string;
  fingerprint: string;
}
export interface HeldSnapshot {
  id: string;
  document: Document;
  pageUrl: string;
  options: EngineOptions;
  tables: Map<string, SnapshotRecord>;
}
