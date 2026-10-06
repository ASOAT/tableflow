import { afterEach, describe, expect, it } from 'vitest';
import { extractTables } from '../src/extractors';
import { candidateView } from '../src/shared/engine';

afterEach(() => document.body.replaceChildren());
describe('structured extraction engine', () => {
  it('prefers one native candidate for a table carrying overlapping ARIA semantics', () => {
    document.body.innerHTML = '<table role="grid"><tr role="row"><th role="columnheader">名称</th></tr>'
      + '<tr role="row"><td role="gridcell">中文</td></tr></table>';
    const result = extractTables(document);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.type).toBe('native-table');
  });
  it('diagnoses declared data grids without readable row structures', () => {
    document.body.innerHTML = '<div role="grid" aria-rowcount="10" aria-colcount="3">暂未提供可读取的行</div>';
    const result = extractTables(document);
    expect(result.tables).toHaveLength(0);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_STRUCTURE' })]));
  });
  it('reports an oversized component explicitly while preserving other valid tables', () => {
    document.body.innerHTML = '<table><tr><th>正常</th></tr><tr><td>中文</td></tr></table>'
      + '<div class="ant-table"><div class="ant-table-body"><table><tbody>'
      + Array.from({ length: 201 }, () => '<tr><td colspan="1000">过大</td></tr>').join('')
      + '</tbody></table></div></div>';
    const result = extractTables(document);
    expect(result.tables).toHaveLength(2);
    const malformed = result.tables.find((table) => table.type === 'ant-design')!;
    expect(malformed.metadata.complete).toBe(false);
    expect(malformed.metadata.unsupported_reason).toBe('MALFORMED_STRUCTURE');
    expect(malformed.rows.length).toBeLessThanOrEqual(50);
    expect(result.tables.find((table) => table.type === 'native-table')!.metadata.complete).toBe(true);
  });
  it('filters navigation/layout/empty tables without suppressing a data table', () => {
    document.body.innerHTML = '<nav><table><tr><td>首页</td><td>查询</td></tr></table></nav>'
      + '<table role="presentation"><tr><td>左栏</td><td>右栏</td></tr></table>'
      + '<table><tr><td></td></tr></table><table><tr><th>名称</th><th>金额</th></tr><tr><td>中文</td><td>12</td></tr></table>';
    const result = extractTables(document);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.rows).toEqual([['名称', '金额'], ['中文', '12']]);
    expect(extractTables(document, { includeLowConfidence: true }).tables.length).toBeGreaterThan(1);
  });
  it('component ownership prevents split native fragments becoming duplicate candidates', () => {
    document.body.innerHTML = '<div class="ant-table"><div class="ant-table-header"><table><thead><tr><th>名称</th><th>金额</th></tr></thead></table></div>'
      + '<div class="ant-table-body"><table><tbody><tr><td>中文</td><td>12</td></tr></tbody></table></div></div>';
    const result = extractTables(document);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.type).toBe('ant-design');
    expect(result.tables[0]!.rows).toEqual([['名称', '金额'], ['中文', '12']]);
  });
  it('does not promote legacy split virtual widgets to complete', () => {
    document.body.innerHTML = '<div class="datagrid-view" aria-rowcount="100"><div class="datagrid-view2">'
      + '<div class="datagrid-header"><table><tr><th>名称</th><th>金额</th></tr><tr><th>项目</th><th>元</th></tr></table></div>'
      + '<div class="datagrid-body"><table><tr><td>中文</td><td>12</td></tr></table></div></div></div>';
    const result = extractTables(document);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.metadata.headerRows).toBe(2);
    expect(result.tables[0]!.metadata.complete).toBe(false);
    expect(result.tables[0]!.metadata.unsupported_reason).toBe('INCOMPLETE_GRID');
  });
  it('keeps source IDs stable across scan order changes and removes DOM references from results', () => {
    document.body.innerHTML = '<table><tr><th>原表</th></tr><tr><td>甲</td></tr></table>';
    const first = extractTables(document).tables[0]!;
    const added = document.createElement('table'); added.innerHTML = '<tr><th>新增</th></tr>';
    document.body.prepend(added);
    const scanned = extractTables(document).tables.find((candidate) => candidate.sourceElement === first.sourceElement)!;
    expect(scanned.id).toBe(first.id);
    expect(JSON.stringify(candidateView(scanned))).not.toContain('sourceElement');
  });
  it('extracts open shadow roots without inventing closed-root certainty', () => {
    const host = document.createElement('open-grid'); document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<table><tr><th>影子</th></tr><tr><td>中文</td></tr></table>';
    const opaque = document.createElement('closed-grid'); opaque.setAttribute('role', 'grid');
    opaque.setAttribute('aria-rowcount', '2'); opaque.attachShadow({ mode: 'closed' }); document.body.append(opaque);
    const result = extractTables(document);
    expect(result.tables).toHaveLength(1);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CLOSED_SHADOW_ROOT', certainty: 'possible' })]));
  });
});
