import { describe, expect, it } from 'vitest';
import { nativeTableExtractor } from '../src/extractors/nativeTableExtractor';
import { ariaGridExtractor } from '../src/extractors/ariaGridExtractor';
import { normalizeMatrix } from '../src/extractors/normalize';
import { extractHtmlTable, TableExtractionLimitError } from '../src/extractors/html-table';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 0x100000000; };
}

describe('seeded extraction robustness', () => {
  it('does not crash or produce ragged matrices on generated native spans and mixed content', () => {
    const random = seeded(20261006);
    const texts = ['', '中文😀', '逗号,双"引号', '¥1,299.00', '+18.3%', '2026-10-06', '长'.repeat(800)];
    for (let sample = 0; sample < 50; sample += 1) {
      const rows = 1 + Math.floor(random() * 10);
      const columns = 1 + Math.floor(random() * 6);
      const table = document.createElement('table');
      const group = table.createTBody();
      for (let y = 0; y < rows; y += 1) {
        const row = group.insertRow();
        for (let x = 0; x < columns; x += 1) {
          const cell = row.insertCell();
          cell.colSpan = 1 + Math.floor(random() * 3);
          cell.rowSpan = Math.floor(random() * 4);
          const wrapper = document.createElement('div');
          wrapper.textContent = texts[Math.floor(random() * texts.length)]!;
          cell.append(wrapper);
          const hidden = document.createElement('span');
          hidden.hidden = true;
          hidden.textContent = '不可见噪音';
          cell.append(hidden);
        }
      }
      document.body.replaceChildren(table);
      const candidate = nativeTableExtractor.extract(table)!;
      expect(candidate.rows).toHaveLength(rows);
      expect(candidate.columns).toBeGreaterThanOrEqual(columns);
      expect(candidate.columns).toBeLessThanOrEqual(rows * columns * 3);
      expect(candidate.rows.every((row) => row.length === candidate.columns)).toBe(true);
      expect(candidate.rows.flat().every((value) => typeof value === 'string' && !value.includes('不可见噪音'))).toBe(true);
    }
  });
  it('keeps generated sparse ARIA indices bounded and incomplete when cells are missing', () => {
    const random = seeded(701);
    for (let sample = 0; sample < 30; sample += 1) {
      const grid = document.createElement('div');
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-colcount', '8');
      for (let y = 1; y <= 5; y += 1) {
        const row = document.createElement('div');
        row.setAttribute('role', 'row'); row.setAttribute('aria-rowindex', String(y));
        for (let x = 1; x <= 8; x += 1) {
          if (random() < 0.5) continue;
          const cell = document.createElement('span');
          cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-colindex', String(x));
          cell.textContent = random() < 0.3 ? '' : '中文😀'; row.append(cell);
        }
        grid.append(row);
      }
      document.body.replaceChildren(grid);
      const candidate = ariaGridExtractor.extract(grid)!;
      expect(candidate.rows).toHaveLength(5);
      expect(candidate.columns).toBe(8);
      expect(candidate.rows.every((row) => row.length === 8)).toBe(true);
      expect(candidate.metadata.complete).toBe(false);
    }
  });
  it('bounds malicious spans/indices instead of allocating their declared dimensions', () => {
    document.body.innerHTML = '<div role="grid"><div role="row" aria-rowindex="1"><span role="cell" aria-rowspan="999999999" aria-colspan="999999999">爆炸</span></div><div role="row" aria-rowindex="10000"><span role="cell" aria-colindex="999999999">越界</span></div></div>';
    const candidate = ariaGridExtractor.extract(document.body.firstElementChild!)!;
    expect(candidate.columns).toBeLessThanOrEqual(1000);
    expect(candidate.rows.length).toBeLessThanOrEqual(2);
    expect(candidate.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
    expect(candidate.metadata.complete).toBe(false);
  });
  it('normalizes empty and ragged rows without altering Unicode', () => {
    expect(normalizeMatrix([])).toEqual([]);
    expect(normalizeMatrix([[], ['中文😀', '"a,b"']])).toEqual([['', ''], ['中文😀', '"a,b"']]);
  });
  it('stops excessive native span expansion before allocation and returns a diagnostic preview', () => {
    const table = document.createElement('table');
    const body = table.createTBody();
    for (let index = 0; index < 250; index += 1) body.insertRow();
    const anchor = body.rows[0]!.insertCell();
    anchor.textContent = '中文数据'; anchor.colSpan = 1000; anchor.rowSpan = 250;
    document.body.replaceChildren(table);
    expect(() => extractHtmlTable(table)).toThrow(TableExtractionLimitError);
    const candidate = nativeTableExtractor.extract(table)!;
    expect(candidate.metadata).toMatchObject({ complete: false, unsupported_reason: 'MALFORMED_STRUCTURE' });
    expect(candidate.metadata.diagnostics?.[0]).toMatchObject({ code: 'MALFORMED_STRUCTURE', certainty: 'confirmed' });
    expect(candidate.rows.flat()).toContain('中文数据');
    expect(candidate.rows.length * candidate.columns).toBeLessThanOrEqual(1000);
  });
  it('bounds the final native rectangle even when occupied cells are sparse', () => {
    const table = document.createElement('table');
    const body = table.createTBody();
    for (let index = 0; index < 201; index += 1) {
      const cell = body.insertRow().insertCell(); cell.textContent = String(index);
      if (index === 0) cell.colSpan = 1000;
    }
    document.body.replaceChildren(table);
    expect(nativeTableExtractor.extract(table)!.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
  });
  it('bounds accumulated columns and still accepts a normal 5001 by 20 matrix', () => {
    const wide = document.createElement('table');
    const wideRow = wide.insertRow();
    for (let index = 0; index < 2; index += 1) {
      const cell = wideRow.insertCell(); cell.colSpan = 600; cell.textContent = `列 ${index}`;
    }
    document.body.replaceChildren(wide);
    const bounded = nativeTableExtractor.extract(wide)!;
    expect(bounded.metadata.complete).toBe(false);
    expect(bounded.columns).toBeLessThanOrEqual(20);
    const normal = document.createElement('table');
    const body = normal.createTBody();
    for (let y = 0; y < 5001; y += 1) {
      const row = body.insertRow();
      for (let x = 0; x < 20; x += 1) row.insertCell();
    }
    // A supplied reader isolates span/size admission from DOM text-layout cost.
    const matrix = extractHtmlTable(normal, () => '数据');
    expect(matrix).toHaveLength(5001);
    expect(matrix.every((row) => row.length === 20)).toBe(true);
    expect(matrix[5000]?.[19]).toBe('数据');
  }, 30_000);
  it('propagates unexpected DOM failures instead of disguising them as an empty candidate', () => {
    const table = document.createElement('table');
    const cell = table.insertRow().insertCell();
    cell.textContent = '数据';
    Object.defineProperty(cell, 'childNodes', { get: () => { throw new Error('Unexpected DOM failure'); } });
    document.body.replaceChildren(table);
    expect(() => nativeTableExtractor.extract(table)).toThrow('Unexpected DOM failure');
  });
});
