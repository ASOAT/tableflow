import { afterEach, describe, expect, it } from 'vitest';
import { antDesignAdapter } from '../src/extractors/adapters/antDesignAdapter';
import { elementPlusAdapter } from '../src/extractors/adapters/elementPlusAdapter';
import { muiDataGridAdapter } from '../src/extractors/adapters/muiDataGridAdapter';
import { agGridAdapter } from '../src/extractors/adapters/agGridAdapter';
import { diagnoseCandidate } from '../src/extractors/diagnostics';
import type { Extractor, TableCandidate } from '../src/extractors/types';
import { extractTables } from '../src/extractors';

afterEach(() => document.body.replaceChildren());
function extract(adapter: Extractor, markup: string): TableCandidate {
  document.body.innerHTML = markup;
  const roots = adapter.detect(document);
  expect(roots).toHaveLength(1);
  return adapter.extract(roots[0]!)!;
}

describe('modern component DOM shape regressions', () => {
  it('retains the Ant pagination owner while reading a same-table summary once', () => {
    const candidate = extract(antDesignAdapter, '<div class="ant-table-wrapper"><div class="ant-table"><div class="ant-table-content"><table><thead><tr><th>姓名</th><th>金额</th></tr></thead><tbody><tr data-row-key="R001"><td>张三</td><td>¥1,299.00</td></tr></tbody><tfoot class="ant-table-summary"><tr><td>合计</td><td>¥1,299.00</td></tr></tfoot></table></div></div><ul class="ant-pagination"><li><button>下一页</button></li></ul></div>');
    expect(candidate.sourceElement.matches('.ant-table-wrapper')).toBe(true);
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '¥1,299.00'], ['合计', '¥1,299.00']]);
    expect(candidate.metadata.rowMeta?.map((row) => row.kind)).toEqual(['header', 'data', 'summary']);
    expect(diagnoseCandidate(candidate).paginationDetected).toBe(true);
  });

  it('ignores Ant selection and expansion controls without changing their state', () => {
    const candidate = extract(antDesignAdapter, '<div class="ant-table"><div class="ant-table-content"><table><thead><tr><th></th><th><input type="checkbox" checked></th><th>姓名</th></tr></thead><tbody><tr data-row-key="R001"><td><button class="ant-table-row-expand-icon" aria-expanded="true" aria-label="Collapse"></button></td><td><input type="checkbox" checked></td><td>张三</td></tr><tr class="ant-table-expanded-row"><td colspan="3">业务详情</td></tr></tbody></table></div></div>');
    expect(candidate.rows).toEqual([['姓名'], ['张三']]);
    expect(candidate.metadata.controlColumnIndices).toEqual([1, 2]);
    expect(candidate.metadata.observedColumnIndices).toEqual([3]);
    expect(document.querySelectorAll('input:checked')).toHaveLength(2);
    expect(document.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    expect(diagnoseCandidate(candidate).warnings.some((warning) => warning.code === 'CONTROL_COLUMNS_IGNORED')).toBe(true);
  });

  it('consumes Ant empty placeholders and header-only fragments without exporting them as data', () => {
    const candidate = extract(antDesignAdapter, '<div class="ant-table-wrapper"><div class="ant-table"><div class="ant-table-content"><table><thead><tr><th>姓名</th><th>城市</th></tr></thead><tbody><tr class="ant-table-placeholder"><td colspan="2"><div>No data</div></td></tr></tbody></table></div></div></div>');
    expect(candidate.rows).toEqual([]);
    expect(extractTables(document).tables).toEqual([]);
  });

  it('preserves a named business checkbox field rather than deleting it from a class hint', () => {
    const candidate = extract(antDesignAdapter, '<div class="ant-table"><div class="ant-table-content"><table><thead><tr><th class="ant-table-selection-column">审核</th><th>姓名</th></tr></thead><tbody><tr><td class="ant-table-selection-column"><input type="checkbox">通过</td><td>张三</td></tr></tbody></table></div></div>');
    expect(candidate.rows).toEqual([['审核', '姓名'], ['通过', '张三']]);
    expect(candidate.metadata.controlColumnIndices).toEqual([]);
    expect(candidate.metadata.ambiguousControlColumnIndices).toEqual([]);
    expect(candidate.metadata.complete).toBe(true);
  });

  it('retains a named checkbox-only business column while declaring its cell values uncertain', () => {
    const candidate = extract(antDesignAdapter, '<div class="ant-table"><div class="ant-table-content"><table><thead><tr><th>审核</th><th>姓名</th></tr></thead><tbody><tr><td><input type="checkbox" checked></td><td>张三</td></tr><tr><td><input type="checkbox"></td><td>李四</td></tr></tbody></table></div></div>');
    expect(candidate.rows).toEqual([['审核', '姓名'], ['', '张三'], ['', '李四']]);
    expect(candidate.metadata.controlColumnIndices).toEqual([]);
    expect(candidate.metadata.ambiguousControlColumnIndices).toEqual([1]);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.unsupported_reason).toBe('UNSUPPORTED_STRUCTURE');
    expect(document.querySelectorAll('input:checked')).toHaveLength(1);
    expect(diagnoseCandidate(candidate).warnings.some((warning) => warning.code === 'UNKNOWN_GRID_STRUCTURE')).toBe(true);
  });

  it('warns for retained MUI checkbox-only business values without treating a header checkbox as data', () => {
    const candidate = extract(muiDataGridAdapter, '<div class="MuiDataGrid-root" role="grid" aria-rowcount="2" aria-colcount="2"><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1">审核<input type="checkbox"></div><div role="columnheader" aria-colindex="2">姓名</div></div><div role="row" aria-rowindex="2" data-id="R001"><div role="gridcell" aria-colindex="1"><input type="checkbox" checked></div><div role="gridcell" aria-colindex="2">张三</div></div></div>');
    expect(candidate.rows).toEqual([['审核', '姓名'], ['', '张三']]);
    expect(candidate.metadata.ambiguousControlColumnIndices).toEqual([1]);
    expect(candidate.metadata.complete).toBe(false);
    expect(candidate.metadata.unsupported_reason).toBe('UNSUPPORTED_STRUCTURE');
    expect(diagnoseCandidate(candidate).warnings.some((warning) => warning.code === 'UNKNOWN_GRID_STRUCTURE')).toBe(true);
  });

  it('keeps textual MUI business checkbox values complete', () => {
    const candidate = extract(muiDataGridAdapter, '<div class="MuiDataGrid-root" role="grid" aria-rowcount="2" aria-colcount="1"><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1">审核<input type="checkbox"></div></div><div role="row" aria-rowindex="2" data-id="R001"><div role="gridcell" aria-colindex="1"><input type="checkbox" checked>通过</div></div></div>');
    expect(candidate.rows).toEqual([['审核'], ['通过']]);
    expect(candidate.metadata.ambiguousControlColumnIndices).toEqual([]);
    expect(candidate.metadata.complete).toBe(true);
  });

  it.each([
    { name: 'Ant', adapter: antDesignAdapter, markup: '<div class="ant-table"><div class="ant-table-content"><table><thead><tr><th>审核</th></tr></thead><tbody><tr><td><span class="ant-checkbox"><input type="checkbox" checked style="opacity:0"><span class="ant-checkbox-inner"></span></span></td></tr></tbody></table></div></div>' },
    { name: 'MUI', adapter: muiDataGridAdapter, markup: '<div class="MuiDataGrid-root" role="grid" aria-rowcount="2" aria-colcount="1"><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1">审核</div></div><div role="row" aria-rowindex="2" data-id="R001"><div role="gridcell" aria-colindex="1"><span class="MuiCheckbox-root"><input type="checkbox" checked style="opacity:0"><svg aria-hidden="true"></svg></span></div></div></div>' },
  ])('warns for $name visible business checkbox renderers whose native input is transparent', ({ adapter, markup }) => {
    const candidate = extract(adapter, markup);
    expect(candidate.rows).toEqual([['审核'], ['']]);
    expect(candidate.metadata.ambiguousControlColumnIndices).toEqual([1]);
    expect(candidate.metadata.complete).toBe(false);
    expect(document.querySelector('input')?.checked).toBe(true);
  });

  it('does not discard merged summary text occupying otherwise empty control slots', () => {
    const candidate = extract(antDesignAdapter, '<div class="ant-table"><div class="ant-table-content"><table><thead><tr><th></th><th><input type="checkbox"></th><th>金额</th></tr></thead><tbody><tr><td><button class="ant-table-row-expand-icon"></button></td><td><input type="checkbox"></td><td>100</td></tr></tbody><tfoot><tr><td colspan="2">汇总说明</td><td>100</td></tr></tfoot></table></div></div>');
    expect(candidate.rows).toEqual([['', '金额'], ['', '100'], ['汇总说明', '100']]);
    expect(candidate.metadata.controlColumnIndices).toEqual([2]);
    expect(candidate.metadata.complete).toBe(true);
  });

  it('uses visible Element headers instead of hidden body measurement clones', () => {
    const candidate = extract(elementPlusAdapter, '<div class="el-table"><div class="el-table__header-wrapper"><table class="el-table__header"><thead><tr><th>姓名</th><th>城市</th></tr></thead></table></div><div class="el-table__body-wrapper"><table class="el-table__body"><thead aria-hidden="true"><tr><th>姓名</th><th>城市</th></tr></thead><tbody><tr class="el-table__row"><td class="el-table_1_column_1">张三</td><td class="el-table_1_column_2">上海</td></tr></tbody></table></div></div>');
    expect(candidate.rows).toEqual([['姓名', '城市'], ['张三', '上海']]);
    expect(candidate.metadata.headerRows).toBe(1);
    expect(diagnoseCandidate(candidate).extractedRows).toBe(1);
  });

  it('deduplicates nested Element group column IDs and preserves two header levels', () => {
    const candidate = extract(elementPlusAdapter, '<div class="el-table"><div class="el-table__header-wrapper"><table><thead><tr><th colspan="2">交易</th></tr><tr><th>城市</th><th>金额</th></tr></thead></table></div><div class="el-table__body-wrapper"><table><tbody><tr data-row-key="R001"><td class="el-table_1_column_2_column_3">上海</td><td class="el-table_1_column_2_column_4">100</td></tr></tbody></table></div><div class="el-table__fixed"><div class="el-table__fixed-header-wrapper"><table><thead><tr><th>交易</th></tr><tr><th>城市</th></tr></thead></table></div><div class="el-table__fixed-body-wrapper"><table><tbody><tr data-row-key="R001"><td class="el-table_1_column_2_column_3">上海</td></tr></tbody></table></div></div></div>');
    expect(candidate.rows).toEqual([['交易', ''], ['城市', '金额'], ['上海', '100']]);
    expect(candidate.metadata.headerRows).toBe(2);
    expect(candidate.metadata.cloneColumnsRemoved).toBe(1);
    expect(diagnoseCandidate(candidate).warnings.some((warning) => warning.code === 'FIXED_COLUMN_CLONES_REMOVED')).toBe(true);
  });

  it('ignores Element expansion controls and counts its separate footer as summary', () => {
    const candidate = extract(elementPlusAdapter, '<div class="el-table"><div class="el-table__header-wrapper"><table><thead><tr><th></th><th>姓名</th><th>金额</th></tr></thead></table></div><div class="el-table__body-wrapper"><table><tbody><tr><td><button class="el-table__expand-icon" aria-expanded="true"><svg></svg></button></td><td>张三</td><td>100</td></tr><tr><td colspan="3" class="el-table__expanded-cell">详情</td></tr></tbody></table></div><div class="el-table__footer-wrapper"><table><tfoot><tr><td></td><td>合计</td><td>100</td></tr></tfoot></table></div></div>');
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '100'], ['合计', '100']]);
    expect(candidate.metadata.controlColumnIndices).toEqual([1]);
    expect(candidate.metadata.rowMeta?.map((row) => row.kind)).toEqual(['header', 'data', 'summary']);
    expect(diagnoseCandidate(candidate).extractedRows).toBe(1);
  });

  it('reads flat MUI columnheaders outside role=row while preserving actual row identities', () => {
    const candidate = extract(muiDataGridAdapter, '<div class="MuiDataGrid-root"><div class="MuiDataGrid-main" role="grid" aria-rowcount="3" aria-colcount="2"><div class="MuiDataGrid-columnHeaders" role="rowgroup"><div role="columnheader" aria-colindex="2">金额</div><div role="columnheader" aria-colindex="1">姓名</div></div><div role="row" aria-rowindex="2" data-id="R001"><div role="gridcell" aria-colindex="1">张三</div><div role="gridcell" aria-colindex="2">¥1,299.00</div></div><div role="row" aria-rowindex="3" data-id="R002"><div role="gridcell" aria-colindex="1">李四</div><div role="gridcell" aria-colindex="2">¥299.00</div></div></div></div>');
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '¥1,299.00'], ['李四', '¥299.00']]);
    expect(candidate.metadata.rowMeta?.map((row) => row.index)).toEqual([undefined, 2, 3]);
    expect(candidate.metadata.rowMeta?.map((row) => row.key)).toEqual([undefined, 'R001', 'R002']);
    expect(candidate.metadata.complete).toBe(true);
  });

  it('exports only materialized MUI columns, reporting expected business columns honestly', () => {
    const candidate = extract(muiDataGridAdapter, '<div class="MuiDataGrid-root" role="grid" aria-rowcount="2" aria-colcount="8"><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1"><input type="checkbox"></div><div role="columnheader" aria-colindex="3">姓名</div><div role="columnheader" aria-colindex="7">金额</div></div><div role="row" aria-rowindex="2"><div role="gridcell" aria-colindex="1"><input type="checkbox"></div><div role="gridcell" aria-colindex="3">张三</div><div role="gridcell" aria-colindex="7">100</div></div></div>');
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '100']]);
    expect(candidate.metadata.observedColumnIndices).toEqual([3, 7]);
    expect(candidate.metadata.controlColumnIndices).toEqual([1]);
    expect(candidate.metadata.complete).toBe(false);
    expect(diagnoseCandidate(candidate)).toMatchObject({ extractedColumns: 2, expectedColumns: 7, completeness: 'possibly-incomplete' });
    expect(diagnoseCandidate(candidate).warnings.some((warning) => warning.code === 'COLUMN_COUNT_MISMATCH')).toBe(true);
  });

  it('uses all visible AG pinned regions once and compacts horizontal virtual gaps', () => {
    const candidate = extract(agGridAdapter, '<div class="ag-root" role="treegrid" aria-rowcount="2" aria-colcount="6"><div class="ag-pinned-left-header"><div class="ag-header-row" aria-rowindex="1"><div class="ag-header-cell" col-id="name" aria-colindex="1">姓名</div></div></div><div class="ag-header-container"><div class="ag-header-row" aria-rowindex="1"><div class="ag-header-cell" col-id="amount" aria-colindex="4">金额</div></div></div><div class="ag-pinned-left-cols-container"><div class="ag-row" row-id="R001" row-index="0" aria-rowindex="2"><div class="ag-cell" col-id="name" aria-colindex="1">张三</div></div></div><div class="ag-center-cols-container"><div class="ag-row" row-id="R001" row-index="0" aria-rowindex="2"><div class="ag-cell" col-id="name" aria-colindex="1">张三</div><div class="ag-cell" col-id="amount" aria-colindex="4">100</div></div></div></div>');
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '100']]);
    expect(candidate.metadata.observedColumnIndices).toEqual([1, 4]);
    expect(candidate.metadata.cloneColumnsRemoved).toBe(1);
    expect(candidate.metadata.complete).toBe(false);
    expect(diagnoseCandidate(candidate)).toMatchObject({ extractedRows: 1, extractedColumns: 2, expectedColumns: 6 });
  });

  it('uses current AG inner semantic viewport counts to diagnose missing horizontal columns', () => {
    const candidate = extract(agGridAdapter, '<div class="ag-root"><div class="ag-grid-viewport" role="grid" aria-rowcount="2" aria-colcount="20"><div class="ag-header-row" role="row" aria-rowindex="1"><div class="ag-grid-scrolling-cells"><div class="ag-header-cell" col-id="name" aria-colindex="1">姓名</div><div class="ag-header-cell" col-id="amount" aria-colindex="2">金额</div></div></div><div class="ag-row" role="row" row-id="R001" aria-rowindex="2"><div class="ag-grid-scrolling-cells"><div class="ag-cell" col-id="name" aria-colindex="1">张三</div><div class="ag-cell" col-id="amount" aria-colindex="2">100</div></div></div></div></div>');
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '100']]);
    expect(candidate.metadata.expectedColumnCount).toBe(20);
    expect(candidate.metadata.complete).toBe(false);
    expect(diagnoseCandidate(candidate)).toMatchObject({ extractedColumns: 2, expectedColumns: 20, completeness: 'possibly-incomplete' });
  });

  it('uses the declared visible AG column count when hidden columns leave logical index gaps', () => {
    const candidate = extract(agGridAdapter, '<div class="ag-root"><div class="ag-grid-viewport" role="grid" aria-rowcount="2" aria-colcount="2"><div class="ag-header-row" role="row" aria-rowindex="1"><div class="ag-header-cell" col-id="name" aria-colindex="1">姓名</div><div class="ag-header-cell" col-id="amount" aria-colindex="3">金额</div></div><div class="ag-row" role="row" row-id="R001" aria-rowindex="2"><div class="ag-cell" col-id="name" aria-colindex="1">张三</div><div class="ag-cell" col-id="amount" aria-colindex="3">100</div></div></div></div>');
    expect(candidate.rows).toEqual([['姓名', '金额'], ['张三', '100']]);
    expect(candidate.metadata.observedColumnIndices).toEqual([1, 3]);
    expect(candidate.metadata.complete).toBe(true);
    expect(candidate.metadata.missingColumns).toBe(false);
    expect(diagnoseCandidate(candidate)).toMatchObject({ extractedColumns: 2, expectedColumns: 2, completeness: 'complete' });
  });

  it('uses current AG inner row counts plus measured viewport geometry to detect virtualization', () => {
    document.body.innerHTML = '<div class="ag-root"><div class="ag-grid-viewport" role="grid" aria-rowcount="1201" aria-colcount="1" style="overflow:auto"><div class="ag-header-row" aria-rowindex="1"><div class="ag-header-cell" aria-colindex="1">姓名</div></div><div class="ag-row" row-id="R001" row-index="0" aria-rowindex="2"><div class="ag-cell" aria-colindex="1">张三</div></div></div></div>';
    const viewport = document.querySelector('.ag-grid-viewport')!;
    Object.defineProperties(viewport, { clientHeight: { value: 200 }, scrollHeight: { value: 38_400 } });
    const candidate = agGridAdapter.extract(agGridAdapter.detect(document)[0]!)!;
    expect(candidate.metadata.virtualized).toBe(true);
    expect(candidate.metadata.expectedRowCount).toBe(1201);
    expect(candidate.metadata.rowMeta?.at(-1)).toMatchObject({ index: 2, key: 'R001' });
    expect(diagnoseCandidate(candidate)).toMatchObject({ expectedRows: 1200, extractedRows: 1, completeness: 'visible-only' });
  });

  it('marks a loading component incomplete instead of exporting stale-looking data silently', () => {
    const candidate = extract(antDesignAdapter, '<div class="ant-table-wrapper"><div class="ant-spin-spinning"><span role="progressbar"></span></div><div class="ant-table"><div class="ant-table-content"><table><thead><tr><th>姓名</th></tr></thead><tbody><tr><td>旧数据</td></tr></tbody></table></div></div></div>');
    expect(candidate.metadata.loading).toBe(true);
    expect(candidate.metadata.complete).toBe(false);
    expect(diagnoseCandidate(candidate).warnings.some((warning) => warning.code === 'LOADING')).toBe(true);
  });

  it('does not treat a business-cell progress renderer as a whole-component loading overlay', () => {
    const candidate = extract(antDesignAdapter, '<div class="ant-table"><div class="ant-table-content"><table><thead><tr><th>进度</th></tr></thead><tbody><tr><td><span role="progressbar">50%</span></td></tr></tbody></table></div></div>');
    expect(candidate.rows).toEqual([['进度'], ['50%']]);
    expect(candidate.metadata.complete).toBe(true);
  });
});
