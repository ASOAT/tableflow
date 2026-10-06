import { discoverTables, type TableCandidate } from '../extractors/discovery';
import { createVisibilityCheck } from '../extractors/html-table';
import type { ScanOptions, ScanResult } from '../shared/table';

export function discoverPageTables(root: Document, options: ScanOptions = {}): {
  candidates: Array<TableCandidate & { source: string }>;
  inaccessibleFrameCount: number;
} {
  const candidates: Array<TableCandidate & { source: string }> = [];
  const visited = new Set<Document>();
  let inaccessibleFrameCount = 0;

  function visit(doc: Document, path: number[]): void {
    if (visited.has(doc)) return;
    visited.add(doc);
    const source = path.length === 0 ? '当前页面' : `内嵌页面 ${path.join('.')}`;
    for (const candidate of discoverTables(doc, options)) {
      candidates.push({ ...candidate, source: candidate.label ? `${source} · ${candidate.label}` : source });
    }
    const isHidden = createVisibilityCheck();
    const frames = doc.querySelectorAll<HTMLIFrameElement | HTMLFrameElement>('iframe, frame');
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index]!;
      if (!options.includeLayout && isHidden(frame)) continue;
      try {
        const child = frame.contentDocument;
        if (!child) {
          inaccessibleFrameCount += 1;
          continue;
        }
        visit(child, [...path, index + 1]);
      } catch {
        // Cross-origin documents cannot be read with the current activeTab grant.
        inaccessibleFrameCount += 1;
      }
    }
  }

  visit(root, []);
  return { candidates, inaccessibleFrameCount };
}

// The build exposes this function in the extension's isolated world only.
// No listener, DOM mutation, persistent table data, or network request is needed.
export function scanTables(options: ScanOptions = {}): ScanResult {
  const { candidates, inaccessibleFrameCount } = discoverPageTables(document, options);
  return {
    tables: candidates.map(({ matrix, source }, index) => ({
      id: index + 1,
      rowCount: matrix.length,
      columnCount: matrix[0]?.length ?? 0,
      preview: matrix.slice(0, 2)
        .map((row) => row.slice(0, 3).map((cell) => cell.replace(/\s+/g, ' ')).join(' · '))
        .join(' / ').slice(0, 100),
      matrix,
      source,
    })),
    inaccessibleFrameCount,
  };
}
