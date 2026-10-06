import { extractTables } from '../extractors';
import { sanitizeStructuralSnapshot, type StructuralSnapshot, type StructuralSnapshotLimits } from '../shared/structural-snapshot';

export function generateStructuralSnapshot(id: string, limits?: StructuralSnapshotLimits): StructuralSnapshot {
  const candidate = extractTables(document, { includeLowConfidence: true }).tables.find((table) => table.id === id);
  if (!candidate?.sourceElement.isConnected) throw new Error('页面内容已变化，请重新扫描。');
  return sanitizeStructuralSnapshot(candidate.sourceElement, limits);
}
