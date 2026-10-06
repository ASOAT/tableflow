import { extractTables } from '../extractors';
import type { TableCandidate } from '../extractors/types';
import { candidateView, type EngineOptions, type TableCandidateView } from '../shared/engine';
import { engineState } from '../shared/engine-state';
import type { SnapshotValidation } from '../shared/snapshot';

function fingerprint(candidate: TableCandidate): string {
  return JSON.stringify(candidateView(candidate));
}

/** Hold one scan in memory; output tokens contain no page URL or table content. */
export function holdSnapshot(
  candidates: TableCandidate[], options: EngineOptions = {}, observedCandidates = candidates,
): { tables: TableCandidateView[]; snapshotId: string } {
  engineState.snapshotOwnerId ??= globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  engineState.snapshotSequence = (engineState.snapshotSequence ?? 0) + 1;
  const snapshotId = `${engineState.snapshotOwnerId}:${engineState.snapshotSequence}`;
  engineState.snapshot = {
    id: snapshotId, document, pageUrl: document.URL, options: { ...options },
    tables: new Map(candidates.map((candidate) => {
      const observed = observedCandidates.find((entry) => entry.sourceElement === candidate.sourceElement);
      return [candidate.id, { sourceElement: candidate.sourceElement,
        ownerDocument: candidate.sourceElement.ownerDocument,
        ownerUrl: candidate.sourceElement.ownerDocument.URL,
        fingerprint: observed ? fingerprint(observed) : '' }];
    })),
  };
  return { tables: candidates.map((candidate) => ({ ...candidateView(candidate),
    rows: candidate.rows.map((row) => [...row]), snapshotId })), snapshotId };
}

/** Validate only; never replace the matrix already shown in the Popup preview. */
export function validateSnapshot(snapshotId: string, id: string): SnapshotValidation {
  if (engineState.collection) return { valid: false, reason: 'COLLECTION_RUNNING' };
  const snapshot = engineState.snapshot;
  if (!snapshot || !snapshotId || snapshot.id !== snapshotId) return { valid: false, reason: 'STALE_SNAPSHOT' };
  if (snapshot.document !== document || snapshot.pageUrl !== document.URL) return { valid: false, reason: 'PAGE_CHANGED' };
  const record = snapshot.tables.get(id);
  if (!record) return { valid: false, reason: 'STALE_SNAPSHOT' };
  if (!record.sourceElement.isConnected) return { valid: false, reason: 'TABLE_REMOVED' };
  if (record.ownerDocument.URL !== record.ownerUrl) return { valid: false, reason: 'PAGE_CHANGED' };
  const current = extractTables(document, snapshot.options).tables
    .find((candidate) => candidate.id === id && candidate.sourceElement === record.sourceElement);
  if (!current) return { valid: false, reason: 'TABLE_REMOVED' };
  if (fingerprint(current) !== record.fingerprint) return { valid: false, reason: 'TABLE_CHANGED' };
  return { valid: true };
}
