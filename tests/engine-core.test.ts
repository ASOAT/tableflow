import { describe, expect, it } from 'vitest';
import { extractVisibleText, normalizeMatrix } from '../src/extractors/normalize';
import { nativeTableExtractor } from '../src/extractors/nativeTableExtractor';
import { ariaGridExtractor } from '../src/extractors/ariaGridExtractor';
import { divGridExtractor } from '../src/extractors/divGridExtractor';
import { walkAccessibleRoots } from '../src/extractors/domWalker';

function mount(markup: string): Element {
  document.body.innerHTML = markup;
  return document.body.firstElementChild!;
}

describe('shared visible text', () => {
  it('preserves punctuation and visible link/button data, omitting semantic auxiliary text', () => {
    const cell = mount('<div>中文 ¥1,299.00 +18.3% 2026-10-06 SKU-A001 <a>链接</a> <button>已完成<span aria-hidden="true">辅助</span></button><svg><title>图标</title></svg><span role="tooltip">提示</span><span hidden>隐藏</span><script>noise</script></div>');
    expect(extractVisibleText(cell)).toBe('中文 ¥1,299.00 +18.3% 2026-10-06 SKU-A001 链接 已完成');
  });
  it('ignores clipped accessibility clones and preserves explicit or CSS line breaks', () => {
    const cell = mount('<div style="white-space:pre-line">甲\n乙<br>丙<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0px,0px,0px,0px)">重复</span></div>');
    expect(extractVisibleText(cell)).toBe('甲\n乙\n丙');
  });
  it('pads sparse rows without changing cell values', () => {
    expect(normalizeMatrix([['a', ''], ['¥1,299.00']])).toEqual([['a', ''], ['¥1,299.00', '']]);
  });
});

describe('native engine extractor', () => {
  it('retains multilevel spans, summaries, empty values and visible button content', () => {
    const table = mount('<table><thead><tr><th rowspan="2">商品</th><th colspan="2">2026</th></tr><tr><th>Q1</th><th>Q2</th></tr></thead><tbody><tr><td><button>已完成</button></td><td>¥1,299.00</td><td></td></tr></tbody><tfoot><tr><td>合计</td><td>1299</td><td>0</td></tr></tfoot></table>');
    const candidate = nativeTableExtractor.extract(table)!;
    expect(candidate.rows).toEqual([['商品', '2026', ''], ['', 'Q1', 'Q2'], ['已完成', '¥1,299.00', ''], ['合计', '1299', '0']]);
    expect(candidate.metadata.rowMeta?.map((row) => row.kind)).toEqual(['header', 'header', 'data', 'summary']);
    expect(candidate.metadata.complete).toBe(true);
    expect(candidate.confidence).toBeGreaterThan(0.9);
  });
  it('assigns low confidence to layout/navigation/form/empty structures', () => {
    mount('<nav><table><tr><td>首页</td></tr></table></nav><form><table><tr><th>姓名</th><td><input value="张三"></td></tr><tr><th>城市</th><td><select><option>上海</option></select></td></tr></table></form><table></table>');
    expect(nativeTableExtractor.detect(document).map((table) => nativeTableExtractor.extract(table)!.confidence)).toEqual([0.1, 0.2, 0.05]);
  });
  it('marks declared but unrendered native rows incomplete', () => {
    const candidate = nativeTableExtractor.extract(mount('<table aria-rowcount="10"><tr><th>姓名</th></tr><tr><td>张三</td></tr></table>'))!;
    expect(candidate.metadata).toMatchObject({ complete: false, expectedRowCount: 10, unsupported_reason: 'INCOMPLETE_GRID' });
    expect(candidate.metadata.virtualized).not.toBe(true);
  });
  it('does not expose ordinary DOM row positions as stable logical identities', () => {
    const candidate = nativeTableExtractor.extract(mount('<table><tr><th>姓名</th></tr><tr aria-rowindex="21" data-row-key="record-21"><td>张三</td></tr><tr><td>李四</td></tr></table>'))!;
    expect(candidate.metadata.rowMeta?.map((row) => row.index)).toEqual([undefined, 21, undefined]);
    expect(candidate.metadata.rowMeta?.[1]?.key).toBe('record-21');
  });
});

describe('ARIA engine extractor', () => {
  it('supports table/grid/treegrid roles with row headers, indices and spans', () => {
    const grid = mount('<div role="treegrid" aria-colcount="3" aria-rowcount="3"><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1" aria-colspan="2">2026</div><div role="columnheader" aria-colindex="3">城市</div></div><div role="row" aria-rowindex="2"><div role="rowheader" aria-colindex="1" aria-rowspan="2">张三</div><div role="gridcell" aria-colindex="2">100</div><div role="cell" aria-colindex="3">上海</div></div><div role="row" aria-rowindex="3"><div role="cell" aria-colindex="2">200</div><div role="cell" aria-colindex="3">北京</div></div></div>');
    const candidate = ariaGridExtractor.extract(grid)!;
    expect(candidate.rows).toEqual([['2026', '', '城市'], ['张三', '100', '上海'], ['', '200', '北京']]);
    expect(candidate.metadata).toMatchObject({ complete: true, headerRows: 1 });
  });
  it('merges pinned fragments with identical logical row indices', () => {
    const candidate = ariaGridExtractor.extract(mount('<div role="grid" aria-colcount="2"><div><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1">姓名</div></div><div role="row" aria-rowindex="2"><div role="gridcell" aria-colindex="1">张三</div></div></div><div><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="2">城市</div></div><div role="row" aria-rowindex="2"><div role="gridcell" aria-colindex="2">上海</div></div></div></div>'))!;
    expect(candidate.rows).toEqual([['姓名', '城市'], ['张三', '上海']]);
    expect(candidate.metadata.complete).toBe(true);
  });
  it('reports sparse rows and missing columns rather than claiming completeness', () => {
    const candidate = ariaGridExtractor.extract(mount('<div role="grid" aria-rowcount="3" aria-colcount="3"><div role="row" aria-rowindex="1"><span role="columnheader" aria-colindex="1">姓名</span><span role="columnheader" aria-colindex="3">城市</span></div><div role="row" aria-rowindex="3"><span role="gridcell" aria-colindex="1">张三</span><span role="gridcell" aria-colindex="3">上海</span></div></div>'))!;
    expect(candidate.rows).toEqual([['姓名', '', '城市'], ['张三', '', '上海']]);
    expect(candidate.metadata.rowMeta?.map((row) => row.index)).toEqual([1, 3]);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.missingColumns).toBe(true);
    expect(candidate.metadata.diagnostics?.every((entry) => entry.code === 'INCOMPLETE_GRID')).toBe(true);
  });
  it('reports conflicting fragments and rejects oversized coordinates safely', () => {
    const candidate = ariaGridExtractor.extract(mount('<div role="grid"><div role="row" aria-rowindex="1"><span role="cell" aria-colindex="1">甲</span><span role="cell" aria-colindex="10000000">越界</span></div><div role="row" aria-rowindex="1"><span role="cell" aria-colindex="1">乙</span></div></div>'))!;
    expect(candidate.rows).toEqual([['甲']]);
    expect(candidate.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
    expect(candidate.metadata.complete).toBe(false);
  });
  it('recognizes virtualization from total count rather than a class name', () => {
    const grid = mount('<div role="grid" data-total-rows="100" style="overflow:auto"><div role="row" aria-rowindex="21" data-row-key="record-21"><span role="gridcell">重复</span></div><div role="row" aria-rowindex="22" data-row-key="record-22"><span role="gridcell">重复</span></div></div>');
    Object.defineProperties(grid, { clientHeight: { value: 100 }, scrollHeight: { value: 2000 } });
    const candidate = ariaGridExtractor.extract(grid)!;
    expect(candidate.rows).toEqual([['重复'], ['重复']]);
    expect(candidate.metadata).toMatchObject({ complete: false, virtualized: true, expectedRowCount: 100 });
    expect(candidate.metadata.rowMeta?.map((row) => row.key)).toEqual(['record-21', 'record-22']);
  });
  it('does not absorb the rows of a nested grid', () => {
    const grid = mount('<div role="grid"><div role="row"><span role="cell">外</span></div><div role="grid"><div role="row"><span role="cell">内</span></div></div></div>');
    expect(ariaGridExtractor.extract(grid)!.rows).toEqual([['外']]);
  });
  it('keeps unindexed row slots separate from declared logical row identities', () => {
    const grid = mount('<div role="grid" aria-rowcount="20"><div role="row"><span role="gridcell">相同</span></div><div role="row"><span role="gridcell">相同</span></div></div>');
    const candidate = ariaGridExtractor.extract(grid)!;
    expect(candidate.rows).toEqual([['相同'], ['相同']]);
    expect(candidate.metadata.rowMeta?.every((row) => row.index === undefined)).toBe(true);
    expect(candidate.metadata.complete).toBe(false);
  });
});

describe('generic div structure', () => {
  const markup = '<div><div data-header="true"><span>姓名</span><span>城市</span></div><div><span>张三</span><span>上海</span></div><div><span>李四</span><span>北京</span></div></div>';
  it('uses repeated direct row/cell structure without requiring framework classes', () => {
    const candidate = divGridExtractor.extract(mount(markup))!;
    expect(candidate.rows).toEqual([['姓名', '城市'], ['张三', '上海'], ['李四', '北京']]);
    expect(candidate.metadata).toMatchObject({ headerRows: 1, complete: true });
    expect(divGridExtractor.detect(document)).toHaveLength(1);
  });
  it('does not treat navigation/form or uneven card content as a data grid', () => {
    const nav = mount(`<nav>${markup}</nav>`);
    expect(divGridExtractor.extract(nav.firstElementChild!)).toBeNull();
    const uneven = mount('<div><div><span>A</span><span>B</span></div><div><span>A</span><span>B</span><span>C</span></div><div><span>A</span><span>B</span></div></div>');
    expect(divGridExtractor.extract(uneven)).toBeNull();
  });
  it('rejects conflicting real column geometry', () => {
    const grid = mount(markup);
    for (const [rowIndex, row] of Array.from(grid.children).entries()) {
      for (const [column, cell] of Array.from(row.children).entries()) {
        cell.getBoundingClientRect = () => ({ left: column * 100 + rowIndex * 20, width: 80 } as DOMRect);
      }
    }
    expect(divGridExtractor.extract(grid)).toBeNull();
  });
});

describe('accessible DOM roots', () => {
  it('walks nested open shadows and same-origin frames once', () => {
    const host = mount('<custom-grid></custom-grid>');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<nested-grid></nested-grid><iframe></iframe>';
    const nested = shadow.querySelector('nested-grid')!.attachShadow({ mode: 'open' });
    nested.innerHTML = '<table><tr><th>姓名</th></tr><tr><td>张三</td></tr></table>';
    const result = walkAccessibleRoots(document);
    expect(result.roots.map((entry) => entry.root)).toEqual([document, shadow, nested, shadow.querySelector('iframe')!.contentDocument]);
    expect(result.diagnostics).toEqual([]);
  });
  it('reports inaccessible frame permission and only possible closed-shadow roots', () => {
    mount('<closed-grid role="grid" aria-rowcount="20"></closed-grid><plain-element></plain-element><iframe></iframe>');
    document.querySelector('closed-grid')!.attachShadow({ mode: 'closed' });
    Object.defineProperty(document.querySelector('iframe'), 'contentDocument', { get: () => null });
    const result = walkAccessibleRoots(document);
    expect(result.diagnostics.map((entry) => [entry.code, entry.certainty])).toEqual([
      ['CLOSED_SHADOW_ROOT', 'possible'], ['CROSS_ORIGIN_FRAME_PERMISSION', 'confirmed'],
    ]);
  });
  it('skips hidden hosts and frames and propagates unexpected errors', () => {
    mount('<custom-grid hidden></custom-grid><iframe hidden></iframe><iframe id="broken"></iframe>');
    document.querySelector('custom-grid')!.attachShadow({ mode: 'open' });
    Object.defineProperty(document.querySelector('#broken'), 'contentDocument', { get: () => { throw new Error('Unexpected'); } });
    expect(() => walkAccessibleRoots(document)).toThrow('Unexpected');
    document.querySelector('#broken')!.remove();
    expect(walkAccessibleRoots(document).roots).toHaveLength(1);
  });
});
