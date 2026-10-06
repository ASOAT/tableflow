import { describe, expect, it } from 'vitest';
import { discoverTables } from '../src/extractors/discovery';
import { discoverPageTables, scanTables } from '../src/content/scan';

const dataTable = '<table><tr><th>姓名</th><th>备注</th></tr><tr><td>张三</td><td>上海, "中文"<br>第二行</td></tr></table>';

function mount(markup: string): void {
  document.body.innerHTML = markup;
}

function fillFrame(frame: HTMLIFrameElement, markup: string): Document {
  const doc = frame.contentDocument!;
  doc.body.innerHTML = markup;
  return doc;
}

describe('data table discovery', () => {
  it('filters layout, navigation, form, empty, hidden, and spacer tables by default', () => {
    mount(`
      <table id="layout"><tr><td><nav><table id="nav"><tr><td><a href="/a">菜单甲</a></td><td><a href="/b">菜单乙</a></td></tr>
        <tr><td><a href="/c">菜单丙</a></td><td><a href="/d">菜单丁</a></td></tr></table></nav></td><td>${dataTable}</td></tr></table>
      <form><table id="form"><tr><td>省份</td><td><select><option>浙江</option><option>江苏</option></select></td></tr>
        <tr><td>城市</td><td><input value="杭州"></td></tr></table></form>
      <table id="empty"><tr><td></td><td> </td></tr><tr><td></td><td></td></tr></table>
      <table id="hidden" hidden><tr><th>隐藏</th></tr><tr><td>秘密</td></tr></table>
      <table id="spacer"><tr><td><img src="spacer.gif" alt="spacer"></td></tr></table>
    `);
    const candidates = discoverTables(document);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.matrix).toEqual([['姓名', '备注'], ['张三', '上海, "中文"\n第二行']]);
    expect(discoverTables(document, { includeLayout: true })).toHaveLength(7);
  });

  it('preserves single-column header tables and plain two-row, two-column data', () => {
    mount('<table><tr><th>姓名</th></tr><tr><td>张三</td></tr></table><table><tr><td>张三</td><td>上海</td></tr><tr><td>李四</td><td>北京</td></tr></table>');
    expect(discoverTables(document).map((candidate) => candidate.matrix)).toEqual([
      [['姓名'], ['张三']], [['张三', '上海'], ['李四', '北京']],
    ]);
  });

  it('excludes link-only menus and explicit presentation tables, preserving numeric linked data', () => {
    mount(`
      <table><tr><td><a href="/a">首页</a></td><td><a href="/b">新闻</a></td></tr><tr><td><a href="/c">帮助</a></td><td><a href="/d">联系</a></td></tr></table>
      <table role="presentation"><tr><th>菜单</th></tr><tr><td>首页</td></tr></table>
      <table><tr><td><a href="/1">商品 1</a></td><td>100</td></tr><tr><td><a href="/2">商品 2</a></td><td>200</td></tr></table>
    `);
    expect(discoverTables(document)).toHaveLength(1);
    expect(discoverTables(document)[0]!.matrix).toEqual([['商品 1', '100'], ['商品 2', '200']]);
  });

  it('does not classify a table from an arbitrary class name', () => {
    mount('<table class="layout menu form"><tr><th>姓名</th></tr><tr><td>张三</td></tr></table>');
    expect(discoverTables(document)).toHaveLength(1);
  });

  it('distinguishes th form labels from a data column header row inside a form', () => {
    mount(`<form>
      <table><tr><th>姓名</th><td><input value="张三"></td></tr><tr><th>城市</th><td><select><option>上海</option></select></td></tr></table>
      <table><tr><th>姓名</th><th>城市</th></tr><tr><td><input value="张三"></td><td>上海</td></tr></table>
    </form>`);
    expect(discoverTables(document).map((candidate) => candidate.matrix)).toEqual([
      [['姓名', '城市'], ['张三', '上海']],
    ]);
  });

  it('combines recognized EasyUI split header/body and frozen columns exactly once', () => {
    mount(`
      <div class="datagrid-view">
        <div class="datagrid-view1">
          <div class="datagrid-header"><table><tr><td>姓名</td></tr></table></div>
          <div class="datagrid-body"><table><tr><td>张三</td></tr><tr><td>李四</td></tr></table></div>
        </div>
        <div class="datagrid-view2">
          <div class="datagrid-header"><table><tr><td>城市</td><td>备注</td></tr></table></div>
          <div class="datagrid-body"><table id="body"><tr><td>上海</td><td>含,逗号</td></tr><tr><td>北京</td><td>"引号"<br>换行</td></tr></table></div>
        </div>
      </div>
    `);
    const candidates = discoverTables(document);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.anchor.id).toBe('body');
    expect(candidates[0]!.label).toBe('EasyUI 表格');
    expect(candidates[0]!.matrix).toEqual([
      ['姓名', '城市', '备注'], ['张三', '上海', '含,逗号'], ['李四', '北京', '"引号"\n换行'],
    ]);
    expect(discoverTables(document, { includeLayout: true })).toHaveLength(1);
  });

  it('combines EasyUI header/body without frozen columns', () => {
    mount('<div class="datagrid-view"><div class="datagrid-view2"><div class="datagrid-header"><table><tr><td>姓名</td><td>城市</td></tr></table></div><div class="datagrid-body"><table><tr><td>张三</td><td>上海</td></tr></table></div></div></div>');
    expect(discoverTables(document)[0]!.matrix).toEqual([['姓名', '城市'], ['张三', '上海']]);
  });

  it('does not merge mismatched frozen body row counts', () => {
    mount(`<div class="datagrid-view">
      <div class="datagrid-view1"><div class="datagrid-header"><table><tr><th>编号</th></tr></table></div><div class="datagrid-body"><table><tr><td>A</td></tr></table></div></div>
      <div class="datagrid-view2"><div class="datagrid-header"><table><tr><th>姓名</th><th>城市</th></tr></table></div><div class="datagrid-body"><table><tr><td>张三</td><td>上海</td></tr><tr><td>李四</td><td>北京</td></tr></table></div></div>
    </div>`);
    expect(discoverTables(document).every((candidate) => candidate.label === undefined)).toBe(true);
  });

  it('avoids duplicating jqGrid frozen prefixes and excludes jqgfirstrow sizing rows', () => {
    mount(`<div class="ui-jqgrid"><div class="ui-jqgrid-view">
      <div class="ui-jqgrid-hdiv"><table class="ui-jqgrid-htable"><tr><th>姓名</th><th>城市</th></tr></table></div>
      <div class="ui-jqgrid-bdiv"><table id="jqbody" class="ui-jqgrid-btable"><tr class="jqgfirstrow"><td></td><td></td></tr><tr><td>张三</td><td>上海</td></tr><tr><td>李四</td><td>北京</td></tr></table></div>
      <div class="ui-jqgrid-hdiv frozen-div"><table class="ui-jqgrid-htable"><tr><th>姓名</th></tr></table></div>
      <div class="ui-jqgrid-bdiv frozen-bdiv"><table class="ui-jqgrid-btable"><tr class="jqgfirstrow"><td></td></tr><tr><td>张三</td></tr><tr><td>李四</td></tr></table></div>
    </div></div>`);
    const candidates = discoverTables(document);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.anchor.id).toBe('jqbody');
    expect(candidates[0]!.matrix).toEqual([['姓名', '城市'], ['张三', '上海'], ['李四', '北京']]);
  });

  it('combines jqGrid frozen columns when the main table omits them', () => {
    mount(`<div class="ui-jqgrid-view">
      <div class="ui-jqgrid-hdiv"><table class="ui-jqgrid-htable"><tr><th>城市</th></tr></table></div>
      <div class="ui-jqgrid-bdiv"><table class="ui-jqgrid-btable"><tr><td>上海</td></tr><tr><td>北京</td></tr></table></div>
      <div class="frozen-div"><table><tr><th>姓名</th></tr></table></div>
      <div class="frozen-bdiv"><table><tr><td>张三</td></tr><tr><td>李四</td></tr></table></div>
    </div>`);
    expect(discoverTables(document)[0]!.matrix).toEqual([['姓名', '城市'], ['张三', '上海'], ['李四', '北京']]);
  });

  it('uses jqGrid column identities when the duplicated main frozen cells are hidden', () => {
    mount(`<div class="ui-jqgrid">
      <div class="ui-jqgrid-hdiv"><table class="ui-jqgrid-htable"><tr><th id="grid_name" hidden>姓名</th><th id="grid_city">城市</th></tr></table></div>
      <div class="ui-jqgrid-bdiv"><table class="ui-jqgrid-btable"><tr><td aria-describedby="grid_name" hidden>张三</td><td aria-describedby="grid_city">上海</td></tr></table></div>
      <div class="frozen-div"><table><tr><th id="grid_name">姓名</th></tr></table></div>
      <div class="frozen-bdiv"><table><tr><td aria-describedby="grid_name">张三</td></tr></table></div>
    </div>`);
    expect(discoverTables(document)[0]!.matrix).toEqual([['姓名', '城市'], ['张三', '上海']]);
  });

  it('keeps generic nearby tables separate rather than guessing a shared widget', () => {
    mount('<div><table><tr><th>姓名</th><th>城市</th></tr></table><table><tr><td>张三</td><td>上海</td></tr><tr><td>李四</td><td>北京</td></tr></table></div>');
    expect(discoverTables(document)).toHaveLength(2);
  });
});

describe('page and same-origin frame discovery', () => {
  it('finds data inside a same-origin frame within a two-column layout', () => {
    mount('<table><tr><td><nav><table><tr><td>菜单</td></tr></table></nav></td><td><iframe id="records"></iframe></td></tr></table>');
    fillFrame(document.querySelector<HTMLIFrameElement>('iframe')!, dataTable);
    const result = discoverPageTables(document);
    expect(result.inaccessibleFrameCount).toBe(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.source).toBe('内嵌页面 1');
    expect(result.candidates[0]!.matrix[1]).toEqual(['张三', '上海, "中文"\n第二行']);
  });

  it('recurses into nested same-origin frames and returns contiguous scan IDs', () => {
    mount(`${dataTable}<iframe></iframe>`);
    const child = fillFrame(document.querySelector<HTMLIFrameElement>('iframe')!, `${dataTable}<iframe></iframe>`);
    fillFrame(child.querySelector<HTMLIFrameElement>('iframe')!, dataTable);
    const result = scanTables();
    expect(result.tables.map((table) => table.id)).toEqual([1, 2, 3]);
    expect(result.tables.map((table) => table.source)).toEqual(['当前页面', '内嵌页面 1', '内嵌页面 1.1']);
    expect(result.tables[2]!.rowCount).toBe(2);
    expect(result.tables[2]!.columnCount).toBe(2);
  });

  it('counts inaccessible documents safely, excluding hidden frames by default', () => {
    mount('<iframe id="null"></iframe><iframe id="error"></iframe><iframe id="hidden" hidden></iframe>');
    Object.defineProperty(document.getElementById('null'), 'contentDocument', { get: () => null });
    Object.defineProperty(document.getElementById('error'), 'contentDocument', { get: () => { throw new DOMException('Blocked', 'SecurityError'); } });
    Object.defineProperty(document.getElementById('hidden'), 'contentDocument', { get: () => null });
    expect(discoverPageTables(document).inaccessibleFrameCount).toBe(2);
    expect(discoverPageTables(document, { includeLayout: true }).inaccessibleFrameCount).toBe(3);
  });

  it('visits a document only once and does not expose frame URLs or titles', () => {
    mount('<iframe title="sensitive title"></iframe><iframe></iframe>');
    const frames = document.querySelectorAll<HTMLIFrameElement>('iframe');
    const child = fillFrame(frames[0]!, dataTable);
    Object.defineProperty(frames[1], 'contentDocument', { get: () => child });
    const result = discoverPageTables(document);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.source).toBe('内嵌页面 1');
  });

  it('includes a hidden same-origin frame only in the layout fallback', () => {
    mount('<iframe hidden></iframe>');
    fillFrame(document.querySelector<HTMLIFrameElement>('iframe')!, dataTable);
    expect(discoverPageTables(document).candidates).toHaveLength(0);
    expect(discoverPageTables(document, { includeLayout: true }).candidates).toHaveLength(1);
  });
});
