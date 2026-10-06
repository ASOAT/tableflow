import type { TableCandidate, RowMetadata } from '../types';

interface CollectedRow { cells: string[]; meta: RowMetadata; order: number }

/** Stable page identity preserves legitimate duplicate rows; text alone is never a key. */
export class RowCollector {
  private readonly data = new Map<string, CollectedRow>();
  private headers: string[][] = [];
  private summaries: string[][] = [];
  uncertain = false;
  conflicts = false;
  truncated = false;
  columns = 0;
  private firstColumns?: number;

  get size(): number { return this.data.size; }

  add(snapshot: TableCandidate, maximumRows: number): number {
    if (this.firstColumns !== undefined && this.firstColumns !== snapshot.columns) this.conflicts = true;
    this.firstColumns ??= snapshot.columns;
    this.columns = Math.max(this.columns, snapshot.columns);
    const before = this.data.size;
    const headers: string[][] = [];
    const summaries: string[][] = [];
    for (let slot = 0; slot < snapshot.rows.length; slot += 1) {
      const cells = snapshot.rows[slot]!;
      const meta = snapshot.metadata.rowMeta?.[slot]
        ?? { kind: slot < snapshot.metadata.headerRows ? 'header' : 'data' };
      if (meta.kind === 'header') { headers.push(cells); continue; }
      if (meta.kind === 'summary') { summaries.push(cells); continue; }
      let identity: string;
      if (meta.index !== undefined) identity = `index:${meta.index}`;
      else if (meta.key !== undefined && meta.key !== '') identity = `key:${meta.key}`;
      else {
        // This fallback is deliberately marked uncertain and cannot become complete.
        this.uncertain = true;
        identity = `slot:${slot}:${JSON.stringify(cells)}`;
      }
      const existing = this.data.get(identity);
      if (existing && JSON.stringify(existing.cells) !== JSON.stringify(cells)) this.conflicts = true;
      if (existing?.meta.key && meta.key && existing.meta.key !== meta.key) this.conflicts = true;
      if (!existing && this.data.size >= maximumRows) { this.truncated = true; continue; }
      this.data.set(identity, { cells: [...cells], meta, order: existing?.order ?? this.data.size });
    }
    if (headers.length) {
      if (this.headers.length && JSON.stringify(this.headers) !== JSON.stringify(headers)) this.conflicts = true;
      this.headers = headers.map((row) => [...row]);
    }
    if (summaries.length) {
      if (this.summaries.length && JSON.stringify(this.summaries) !== JSON.stringify(summaries)) this.conflicts = true;
      this.summaries = summaries.map((row) => [...row]);
    }
    return this.data.size - before;
  }

  finish(): { rows: string[][]; rowMeta: RowMetadata[]; headerRows: number; completeIndices: boolean } {
    const body = [...this.data.values()].sort((a, b) =>
      a.meta.index !== undefined && b.meta.index !== undefined ? a.meta.index - b.meta.index : a.order - b.order);
    const rows = [...this.headers, ...body.map((row) => row.cells), ...this.summaries]
      .map((row) => Array.from({ length: this.columns }, (_, column) => row[column] ?? ''));
    const rowMeta: RowMetadata[] = [
      ...this.headers.map((_, index) => ({ kind: 'header' as const, index: index + 1 })),
      ...body.map((row) => row.meta),
      ...this.summaries.map(() => ({ kind: 'summary' as const })),
    ];
    const indexed = body.filter((row) => row.meta.index !== undefined);
    const completeIndices = indexed.length === 0 || (indexed.length === body.length
      && indexed.every((row, offset) => row.meta.index === this.headers.length + offset + 1));
    return { rows, rowMeta, headerRows: this.headers.length, completeIndices };
  }
}
