import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { antDesignAdapter } from '../src/extractors/adapters/antDesignAdapter';
import { elementPlusAdapter } from '../src/extractors/adapters/elementPlusAdapter';
import { muiDataGridAdapter } from '../src/extractors/adapters/muiDataGridAdapter';
import { agGridAdapter } from '../src/extractors/adapters/agGridAdapter';
import type { Extractor, TableCandidate } from '../src/extractors/types';
import { diagnoseCandidate } from '../src/extractors/diagnostics';

afterEach(() => document.body.replaceChildren());
function extract(adapter: Extractor, markup: string, prepare?: () => void): TableCandidate {
  document.body.innerHTML = markup;
  prepare?.();
  const roots = adapter.detect(document);
  expect(roots).toHaveLength(1);
  const candidate = adapter.extract(roots[0]!);
  expect(candidate).not.toBeNull();
  return candidate!;
}
function scrollMetrics(selector: string): void {
  const viewport = document.querySelector<HTMLElement>(selector)!;
  viewport.style.overflowY = 'auto';
  Object.defineProperties(viewport, { clientHeight: { value: 100, configurable: true },
    scrollHeight: { value: 2000, configurable: true } });
}
function header(keys: string[], labels: string[], className = ''): string {
  return `<table class="${className}"><thead><tr>${keys.map((key, index) =>
    `<th data-column-key="${key}">${labels[index] ?? ''}</th>`).join('')}</tr></thead></table>`;
}
function body(keys: string[], rows: string[][], className = ''): string {
  return `<table class="${className}"><tbody>${rows.map((row, index) =>
    `<tr data-row-key="r${index}">${keys.map((key, column) =>
      `<td data-column-key="${key}">${row[column] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

describe('Ant Design HTML adapter', () => {
  it('reads one normal table, ignores pure selection controls and preserves summaries and punctuation', () => {
    const candidate = extract(antDesignAdapter, `<div class="ant-table-wrapper">
      <div class="ant-table"><div class="ant-table-content" style="overflow-x:auto"><table>
        <thead><tr><th><input type="checkbox"></th><th>姓名</th><th>备注</th></tr></thead>
        <tbody><tr data-row-key="a"><td><input type="checkbox"></td><td>张三</td><td>他说："你好",世界<br>第二行</td></tr>
          <tr class="ant-table-expanded-row"><td colspan="3"><table><tr><td>展开的详情</td></tr></table></td></tr>
          <tr data-row-key="b"><td></td><td>李四</td><td></td></tr></tbody>
        <tfoot class="ant-table-summary"><tr><td colspan="2">合计</td><td>2</td></tr></tfoot>
      </table></div></div><ul class="ant-pagination"><li>第 3 页，共 99 条</li></ul></div>`);
    expect(candidate.type).toBe('ant-design');
    expect(candidate.rows).toEqual([
      ['姓名', '备注'], ['张三', '他说："你好",世界\n第二行'], ['李四', ''], ['合计', '2'],
    ]);
    expect(candidate.metadata.headerRows).toBe(1);
    expect(candidate.metadata.rowMeta?.map((row) => row.kind)).toEqual(['header', 'data', 'data', 'summary']);
    expect(candidate.metadata.complete).toBe(true);
    expect(candidate.metadata.warnings?.join('')).toContain('展开详情');
    expect(diagnoseCandidate(candidate).warnings.some((warning) => warning.code === 'CONTROL_COLUMNS_IGNORED')).toBe(true);
  });

  it('deduplicates fixed cloned columns in a split header/body table', () => {
    const keys = ['select', 'name', 'amount'];
    const candidate = extract(antDesignAdapter, `<div class="ant-table">
      <div class="ant-table-header">${header(keys, ['', '姓名', '金额'])}</div>
      <div class="ant-table-body">${body(keys, [['<input type="checkbox">', '张三', '10'], ['', '李四', '20']])}</div>
      <div class="ant-table-fixed-left"><div class="ant-table-header">${header(keys.slice(0, 2), ['', '姓名'])}</div>
        <div class="ant-table-body-inner">${body(keys.slice(0, 2), [['', '张三'], ['', '李四']])}</div></div>
    </div>`);
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '10'], ['李四', '20']]);
    expect(candidate.columns).toBe(2);
    expect(candidate.metadata.complete).toBe(true);
  });

  it('joins center-only and fixed columns using row keys and column identities', () => {
    const candidate = extract(antDesignAdapter, `<div class="ant-table">
      <div class="ant-table-header">${header(['name', 'amount'], ['姓名', '金额'])}</div>
      <div class="ant-table-body">${body(['name', 'amount'], [['张三', '10'], ['李四', '20']])}</div>
      <div class="ant-table-fixed-left"><div class="ant-table-header">${header(['select'], [''])}</div>
        <div class="ant-table-body">${body(['select'], [['<input type="checkbox">'], ['']])}</div></div>
      <div class="ant-table-fixed-right"><div class="ant-table-header">${header(['state'], ['状态'])}</div>
        <div class="ant-table-body">${body(['state'], [['通过'], ['待定']])}</div></div>
    </div>`);
    expect(candidate.rows).toEqual([
      ['姓名', '金额', '状态'], ['张三', '10', '通过'], ['李四', '20', '待定'],
    ]);
    expect(candidate.metadata.complete).toBe(true);
  });

  it('refuses an unverified fixed-column alignment and rejects a class-only imitation', () => {
    const candidate = extract(antDesignAdapter, `<div class="ant-table">
      <div class="ant-table-header">${header(['name'], ['姓名'])}</div>
      <div class="ant-table-body"><table><tbody><tr><td data-column-key="name">张三</td></tr></tbody></table></div>
      <div class="ant-table-fixed-left"><div class="ant-table-header">${header(['id'], ['编号'])}</div>
        <div class="ant-table-body"><table><tbody><tr><td data-column-key="id">1</td></tr></tbody></table></div></div>
    </div>`);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
    expect(candidate.rows).toEqual([['姓名'], ['张三']]);
    document.body.innerHTML = '<div class="ant-table">普通菜单</div>';
    expect(antDesignAdapter.detect(document)).toEqual([]);
  });
});

describe('Element Plus HTML adapter', () => {
  it('keeps multiple header levels and summaries while excluding expanded details', () => {
    const candidate = extract(elementPlusAdapter, `<div class="el-table">
      <div class="el-table__header-wrapper"><table class="el-table__header"><thead>
        <tr><th rowspan="2"><input type="checkbox"></th><th colspan="2">交易</th></tr>
        <tr><th>姓名</th><th>金额</th></tr></thead></table></div>
      <div class="el-table__body-wrapper"><table class="el-table__body"><tbody>
        <tr data-row-key="a"><td><input type="checkbox"></td><td>张三</td><td>100</td></tr>
        <tr><td class="el-table__expanded-cell" colspan="3">展开详情，不能作为另一条记录</td></tr>
      </tbody></table></div>
      <div class="el-table__footer-wrapper"><table class="el-table__footer"><tbody>
        <tr><td colspan="2">合计</td><td>100</td></tr></tbody></table></div>
    </div>`);
    expect(candidate.rows).toEqual([['交易', ''], ['姓名', '金额'], ['张三', '100'], ['合计', '100']]);
    expect(candidate.metadata.headerRows).toBe(2);
    expect(candidate.metadata.rowMeta?.at(-1)?.kind).toBe('summary');
    expect(candidate.metadata.warnings?.join('')).toContain('展开详情');
  });

  it('deduplicates fixed clones using Element cell column IDs', () => {
    const candidate = extract(elementPlusAdapter, `<div class="el-table">
      <div class="el-table__header-wrapper"><table><thead><tr><th>姓名</th><th>金额</th></tr></thead></table></div>
      <div class="el-table__body-wrapper"><table class="el-table__body"><tbody><tr data-row-key="a">
        <td class="el-table_4_column_8">张三</td><td class="el-table_4_column_9">10</td></tr></tbody></table></div>
      <div class="el-table__fixed"><div class="el-table__fixed-header-wrapper"><table><thead><tr><th>姓名</th></tr></thead></table></div>
        <div class="el-table__fixed-body-wrapper"><table><tbody><tr data-row-key="a"><td class="el-table_4_column_8">张三</td></tr></tbody></table></div></div>
    </div>`);
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '10']]);
    expect(candidate.columns).toBe(2);
    expect(candidate.metadata.complete).toBe(true);
  });

  it('joins center-only columns to a fixed selection column, including multi-row headers', () => {
    const candidate = extract(elementPlusAdapter, `<div class="el-table">
      <div class="el-table__header-wrapper"><table><thead><tr><th colspan="2">交易</th></tr>
        <tr><th>姓名</th><th>金额</th></tr></thead></table></div>
      <div class="el-table__body-wrapper"><table class="el-table__body"><tbody><tr data-row-key="a">
        <td class="el-table_8_column_21">张三</td><td class="el-table_8_column_22">10</td></tr></tbody></table></div>
      <div class="el-table__fixed"><div class="el-table__fixed-header-wrapper"><table><thead><tr><th rowspan="2">选择</th></tr><tr></tr></thead></table></div>
        <div class="el-table__fixed-body-wrapper"><table><tbody><tr data-row-key="a"><td class="el-table_8_column_20"><input type="checkbox"></td></tr></tbody></table></div></div>
    </div>`);
    expect(candidate.rows).toEqual([['选择', '交易', ''], ['', '姓名', '金额'], ['', '张三', '10']]);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.ambiguousControlColumnIndices).toEqual([1]);
    expect(candidate.metadata.unsupported_reason).toBe('UNSUPPORTED_STRUCTURE');
  });

  it('requires actual table structure rather than an Element class name', () => {
    document.body.innerHTML = '<div class="el-table"><div>没有行列</div></div>';
    expect(elementPlusAdapter.detect(document)).toEqual([]);
    expect(elementPlusAdapter.extract(document.body.firstElementChild!)).toBeNull();
  });
});

describe('MUI Data Grid ARIA adapter', () => {
  it('uses logical row/column indices and ignores a pure selection column', () => {
    const candidate = extract(muiDataGridAdapter, `<div class="MuiDataGrid-root" role="grid" aria-rowcount="3" aria-colcount="3">
      <div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1"><input type="checkbox"></div>
        <div role="columnheader" aria-colindex="2">姓名</div><div role="columnheader" aria-colindex="3">金额</div></div>
      <div role="rowgroup"><div role="row" aria-rowindex="3"><div role="gridcell" aria-colindex="3">20</div><div role="gridcell" aria-colindex="2">李四</div><div role="gridcell" aria-colindex="1"></div></div>
        <div role="row" aria-rowindex="2"><div role="gridcell" aria-colindex="1"></div><div role="gridcell" aria-colindex="2">张三</div><div role="gridcell" aria-colindex="3">10</div></div></div>
    </div>`);
    expect(candidate.type).toBe('mui-data-grid');
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '10'], ['李四', '20']]);
    expect(candidate.metadata.complete).toBe(true);
  });

  it('marks rendered virtual windows incomplete and avoids class-only grids', () => {
    const candidate = extract(muiDataGridAdapter, `<div class="MuiDataGrid-root" role="grid" aria-rowcount="100" aria-colcount="2">
      <div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1">姓名</div><div role="columnheader" aria-colindex="2">金额</div></div>
      <div class="MuiDataGrid-virtualScroller"><div role="row" aria-rowindex="50"><div role="gridcell" aria-colindex="1">张三</div><div role="gridcell" aria-colindex="2">10</div></div></div>
    </div>`, () => scrollMetrics('.MuiDataGrid-virtualScroller'));
    expect(candidate.metadata.virtualized).toBe(true);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.expectedRowCount).toBe(100);
    document.body.innerHTML = '<div class="MuiDataGrid-root">普通文字</div>';
    expect(muiDataGridAdapter.detect(document)).toEqual([]);
  });
});

describe('AG Grid pinned region adapter', () => {
  it('merges center/pinned rows by logical indices without duplicating repeated columns', () => {
    const candidate = extract(agGridAdapter, `<div class="ag-root-wrapper"><div class="ag-root" role="grid" aria-rowcount="3" aria-colcount="3">
      <div class="ag-header-container"><div class="ag-header-row" role="row" aria-rowindex="1"><div class="ag-header-cell" role="columnheader" aria-colindex="2">姓名</div><div class="ag-header-cell" role="columnheader" aria-colindex="3">金额</div></div></div>
      <div class="ag-pinned-left-header"><div class="ag-header-row" role="row" aria-rowindex="1"><div class="ag-header-cell" role="columnheader" aria-colindex="1"><input type="checkbox"></div><div class="ag-header-cell" role="columnheader" aria-colindex="2">姓名</div></div></div>
      <div class="ag-center-cols-container"><div class="ag-row" role="row" aria-rowindex="2"><div class="ag-cell" role="gridcell" aria-colindex="2">张三</div><div class="ag-cell" role="gridcell" aria-colindex="3">10</div></div><div class="ag-row" role="row" aria-rowindex="3"><div class="ag-cell" role="gridcell" aria-colindex="2">李四</div><div class="ag-cell" role="gridcell" aria-colindex="3">20</div></div></div>
      <div class="ag-pinned-left-cols-container"><div class="ag-row" role="row" aria-rowindex="2"><div class="ag-cell" role="gridcell" aria-colindex="1"></div><div class="ag-cell" role="gridcell" aria-colindex="2">张三</div></div><div class="ag-row" role="row" aria-rowindex="3"><div class="ag-cell" role="gridcell" aria-colindex="1"></div><div class="ag-cell" role="gridcell" aria-colindex="2">李四</div></div></div>
      <div class="ag-pinned-right-cols-container"><div class="ag-row" role="row" aria-rowindex="2"><div class="ag-cell" role="gridcell" aria-colindex="3">10</div></div><div class="ag-row" role="row" aria-rowindex="3"><div class="ag-cell" role="gridcell" aria-colindex="3">20</div></div></div>
    </div></div>`);
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '10'], ['李四', '20']]);
    expect(candidate.metadata.complete).toBe(true);
    expect(candidate.metadata.rowMeta?.map((row) => row.index)).toEqual([1, 2, 3]);
  });

  it('falls back to stable row-id/col-id, orders pinned columns and keeps summaries once', () => {
    const candidate = extract(agGridAdapter, `<div class="ag-root" role="grid">
      <div class="ag-header-container"><div class="ag-header-row"><div class="ag-header-cell" col-id="name">姓名</div><div class="ag-header-cell" col-id="amount">金额</div></div></div>
      <div class="ag-pinned-left-header"><div class="ag-header-row"><div class="ag-header-cell" col-id="select"></div></div></div>
      <div class="ag-center-cols-container"><div class="ag-row" row-id="r1"><div class="ag-cell" col-id="name">张三</div><div class="ag-cell" col-id="amount">10</div></div></div>
      <div class="ag-pinned-left-cols-container"><div class="ag-row" row-id="r1"><div class="ag-cell" col-id="select"><input type="checkbox"></div></div></div>
      <div class="ag-pinned-right-cols-container"><div class="ag-row" row-id="r1"><div class="ag-cell" col-id="amount">10</div></div></div>
      <div class="ag-floating-bottom"><div class="ag-row" row-id="total"><div class="ag-cell" col-id="select"></div><div class="ag-cell" col-id="name">合计</div><div class="ag-cell" col-id="amount">10</div></div></div>
    </div>`);
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '10'], ['合计', '10']]);
    expect(candidate.metadata.complete).toBe(true);
    expect(candidate.metadata.rowMeta?.at(-1)?.kind).toBe('summary');
  });

  it('maps indexed and keyed clones together and marks conflicting cells incomplete', () => {
    const candidate = extract(agGridAdapter, `<div class="ag-root" role="grid" aria-rowcount="2" aria-colcount="2">
      <div class="ag-header-container"><div class="ag-header-row" aria-rowindex="1"><div class="ag-header-cell" col-id="name" aria-colindex="1">姓名</div><div class="ag-header-cell" col-id="amount" aria-colindex="2">金额</div></div></div>
      <div class="ag-center-cols-container"><div class="ag-row" row-id="a" aria-rowindex="2"><div class="ag-cell" col-id="name" aria-colindex="1">张三</div><div class="ag-cell" col-id="amount" aria-colindex="2">10</div></div></div>
      <div class="ag-pinned-left-cols-container"><div class="ag-row" row-id="a"><div class="ag-cell" col-id="name">不同值</div></div></div>
    </div>`);
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '10']]);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
  });

  it('reports virtual row/column gaps and does not invent a table from classes alone', () => {
    const candidate = extract(agGridAdapter, `<div class="ag-root" role="grid" aria-rowcount="100" aria-colcount="3">
      <div class="ag-header-row" aria-rowindex="1"><div class="ag-header-cell" aria-colindex="1">姓名</div><div class="ag-header-cell" aria-colindex="3">金额</div></div>
      <div class="ag-body-viewport"><div class="ag-row" aria-rowindex="50"><div class="ag-cell" aria-colindex="1">张三</div><div class="ag-cell" aria-colindex="3">10</div></div></div>
    </div>`, () => scrollMetrics('.ag-body-viewport'));
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '10']]);
    expect(candidate.metadata.virtualized).toBe(true);
    expect(candidate.metadata.complete).toBe(false);
    document.body.innerHTML = '<div class="ag-root"><div class="ag-row"><div class="ag-cell">未知内容</div></div></div>';
    expect(agGridAdapter.extract(document.body.firstElementChild!)).toBeNull();
  });

  it('converts zero-based AG data indices after all header levels', () => {
    const candidate = extract(agGridAdapter, `<div class="ag-root" role="grid" aria-rowcount="3" aria-colcount="1">
      <div class="ag-header-container"><div class="ag-header-row" aria-rowindex="1"><div class="ag-header-cell" aria-colindex="1" col-id="name">团队</div></div>
        <div class="ag-header-row" aria-rowindex="2"><div class="ag-header-cell" aria-colindex="1" col-id="name">姓名</div></div></div>
      <div class="ag-center-cols-container"><div class="ag-row" row-id="a" row-index="0"><div class="ag-cell" col-id="name">张三</div></div></div>
    </div>`);
    expect(candidate.rows).toEqual([['团队'], ['姓名'], ['张三']]);
    expect(candidate.metadata.rowMeta?.at(-1)?.index).toBe(3);
    expect(candidate.metadata.complete).toBe(true);
  });

  it('marks missing cells in an individual row even if that column exists globally', () => {
    const candidate = extract(agGridAdapter, `<div class="ag-root" role="grid" aria-rowcount="2" aria-colcount="2">
      <div class="ag-header-row" aria-rowindex="1"><div class="ag-header-cell" aria-colindex="1">姓名</div><div class="ag-header-cell" aria-colindex="2">金额</div></div>
      <div class="ag-body-viewport"><div class="ag-row" aria-rowindex="2"><div class="ag-cell" aria-colindex="1">张三</div></div></div>
    </div>`, () => scrollMetrics('.ag-body-viewport'));
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '']]);
    expect(candidate.metadata.missingColumns).toBe(true);
    expect(candidate.metadata.virtualized).toBe(false);
    expect(candidate.metadata.complete).toBe(false);
  });

  it.each([
    ['aria-colspan="1000000000"', 1000],
    ['aria-colindex="1000000000"', 0],
  ])('bounds malicious %s before expansion and preserves an explicit diagnostic', (attribute, maximum) => {
    const columnAttribute = attribute.startsWith('aria-colindex') ? attribute : `aria-colindex="1" ${attribute}`;
    const candidate = extract(agGridAdapter, `<div class="ag-root" role="grid">
      <div class="ag-row" row-id="a"><div class="ag-cell" ${columnAttribute}>值</div></div>
    </div>`);
    expect(candidate.columns).toBeLessThanOrEqual(maximum);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
    expect(candidate.metadata.diagnostics?.some((diagnostic) => diagnostic.code === 'MALFORMED_STRUCTURE')).toBe(true);
  });

  it('caps expanded and emitted cells and rejects oversized logical row indices', () => {
    const rows = Array.from({ length: 201 }, (_, index) => `<div class="ag-row" row-id="r${index}" aria-rowindex="${index + 1}">
      <div class="ag-cell" aria-colindex="1" aria-colspan="1000">${index}</div></div>`).join('');
    const candidate = extract(agGridAdapter, `<div class="ag-root" role="grid">${rows}</div>`);
    expect(candidate.rows.length * candidate.columns).toBeLessThanOrEqual(200_000);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
    const invalidRow = extract(agGridAdapter, `<div class="ag-root" role="grid"><div class="ag-row" aria-rowindex="10001">
      <div class="ag-cell" aria-colindex="1">值</div></div></div>`);
    expect(invalidRow.metadata.complete).toBe(false);
    expect(invalidRow.metadata.diagnostics?.some((diagnostic) => diagnostic.message.includes('10000'))).toBe(true);
  });
});

describe('independent framework golden fixtures', () => {
  it.each([
    ['06-ant-design-like', antDesignAdapter],
    ['07-element-plus-like', elementPlusAdapter],
    ['08-mui-grid-like', muiDataGridAdapter],
    ['09-ag-grid-like', agGridAdapter],
    ['13-fixed-columns', antDesignAdapter],
  ] as const)('matches immutable %s matrix and structure', (name, adapter) => {
    const markup = readFileSync(resolve('tests', 'fixtures', `${name}.html`), 'utf8');
    const expected = JSON.parse(readFileSync(resolve('tests', 'expected', `${name}.json`), 'utf8')) as {
      tables: Array<{ type: string; rows: string[][]; columns: number; headerRows: number; complete: boolean }>;
    };
    const candidate = extract(adapter, markup);
    expect({ type: candidate.type, rows: candidate.rows, columns: candidate.columns,
      headerRows: candidate.metadata.headerRows, complete: candidate.metadata.complete }).toEqual(expected.tables[0]);
    if (candidate.metadata.controlColumnIndices?.length) {
      expect(diagnoseCandidate(candidate).warnings.some((warning) => warning.code === 'CONTROL_COLUMNS_IGNORED')).toBe(true);
    }
  });
});
