import { describe, expect, it } from 'vitest';
import { extractHtmlTable, extractHtmlTables } from '../src/extractors/html-table';

function readTable(markup: string): string[][] {
  document.body.innerHTML = markup;
  return extractHtmlTable(document.querySelector('table')!);
}

describe('HTML table extraction', () => {
  it('reads ordinary th/td cells, Chinese, commas, quotes, and empty cells', () => {
    expect(readTable(`
      <table>
        <tr><th>姓名</th><th>备注</th><th>空值</th></tr>
        <tr><td> 张三 </td><td>北京, “中文” and "quotes"</td><td></td></tr>
      </table>
    `)).toEqual([
      ['姓名', '备注', '空值'],
      ['张三', '北京, “中文” and "quotes"', ''],
    ]);
  });

  it('reads thead and tbody and pads short rows into a rectangular matrix', () => {
    expect(readTable(`
      <table>
        <thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></tbody>
      </table>
    `)).toEqual([['A', 'B', 'C'], ['1', '2', ''], ['3', '', '']]);
  });

  it('expands colspan without duplicating the anchor text', () => {
    expect(readTable(`
      <table>
        <tr><th colspan="2">季度</th><th>总计</th></tr>
        <tr><td>一季度</td><td>二季度</td><td>100</td></tr>
      </table>
    `)).toEqual([['季度', '', '总计'], ['一季度', '二季度', '100']]);
  });

  it('expands rowspan and moves later cells around occupied columns', () => {
    expect(readTable(`
      <table>
        <tr><td rowspan="2">团队 A</td><td>甲</td></tr>
        <tr><td>乙</td></tr>
      </table>
    `)).toEqual([['团队 A', '甲'], ['', '乙']]);
  });

  it('handles combined row and column spans', () => {
    expect(readTable(`
      <table>
        <tr><td rowspan="2" colspan="2">合并</td><td>A</td></tr>
        <tr><td>B</td></tr>
        <tr><td>C</td><td>D</td><td>E</td></tr>
      </table>
    `)).toEqual([['合并', '', 'A'], ['', '', 'B'], ['C', 'D', 'E']]);
  });

  it('clamps row spans at row-group boundaries', () => {
    expect(readTable(`
      <table>
        <thead><tr><th rowspan="9">标题</th><th>类别</th></tr></thead>
        <tbody><tr><td>内容</td><td>数据</td></tr></tbody>
        <tbody><tr><td rowspan="0">分组</td><td>一</td></tr><tr><td>二</td></tr></tbody>
        <tfoot><tr><td>尾部</td><td>汇总</td></tr></tfoot>
      </table>
    `)).toEqual([
      ['标题', '类别'], ['内容', '数据'], ['分组', '一'], ['', '二'], ['尾部', '汇总'],
    ]);
  });

  it('preserves explicit breaks and block lines but normalizes source whitespace', () => {
    expect(readTable(`
      <table><tr>
        <td> Hello
          <span> world </span>  again&nbsp; today </td>
        <td>第一行<br>第二行<div>第三行</div><p>第四行</p></td>
      </tr></table>
    `)).toEqual([['Hello world again today', '第一行\n第二行\n第三行\n第四行']]);
  });

  it.each(['pre', 'pre-wrap', 'pre-line', 'break-spaces'])(
    'preserves literal and inherited newlines with white-space: %s',
    (whiteSpace) => {
      expect(readTable(
        `<table><tr><td style="white-space: ${whiteSpace}"> 第一行\n<span>第二行\n第三行</span> </td></tr></table>`,
      )).toEqual([['第一行\n第二行\n第三行']]);
    },
  );

  it('inherits newline-preserving whitespace from the table', () => {
    expect(readTable(
      '<table style="white-space: pre-line"><tr><td>第一行\n<span>第二行</span></td></tr></table>',
    )).toEqual([['第一行\n第二行']]);
  });

  it('ignores hidden and non-rendered UI text while preserving cell slots', () => {
    expect(readTable(`
      <style>.invisible { display: none; }</style>
      <table><tr>
        <td>值<span hidden>隐藏</span><span aria-hidden="true">装饰</span>
          <span class="invisible">菜单</span><span style="visibility: hidden">按钮</span>
          <span style="opacity: 0">透明</span><script>noise()</script>
          <style>.noise { }</style><template>模板</template><svg><title>图标</title></svg>
        </td>
        <td hidden>不可见单元格</td>
        <td>正常</td>
      </tr></table>
    `)).toEqual([['值', '', '正常']]);
  });

  it('reads only selected options instead of the entire dropdown menu', () => {
    expect(readTable(`
      <table><tr><th>地区</th><th>标签</th></tr><tr>
        <td><select><option>北京</option><option selected>上海</option><option>深圳</option></select></td>
        <td><select multiple><option selected>中文</option><option>未选</option><option selected>含,逗号</option></select></td>
      </tr></table>
    `)).toEqual([['地区', '标签'], ['上海', '中文, 含,逗号']]);
  });

  it('reads data control values but excludes action controls and passwords', () => {
    expect(readTable(`
      <table><tr><td><input value="张三" readonly><button>编辑</button><input type="submit" value="提交"></td>
        <td><textarea>第一行\n第二行</textarea><input type="password" value="secret"><input type="hidden" value="noise"></td>
      </tr></table>
    `)).toEqual([['张三', '第一行\n第二行']]);
  });

  it('extracts nested tables separately without copying their text into the parent', () => {
    document.body.innerHTML = `
      <table><tr><td>外层<table><tr><td>内层</td></tr></table>结束</td><td>外二</td></tr></table>
      <table><tr><td>第三张</td></tr></table>
    `;
    expect(extractHtmlTables(document)).toEqual([
      { id: 1, rowCount: 1, columnCount: 2, preview: '外层结束 · 外二', matrix: [['外层结束', '外二']] },
      { id: 2, rowCount: 1, columnCount: 1, preview: '内层', matrix: [['内层']] },
      { id: 3, rowCount: 1, columnCount: 1, preview: '第三张', matrix: [['第三张']] },
    ]);
  });

  it('keeps hidden tables in the scan with blank text and preserves numbering', () => {
    document.body.innerHTML = `
      <div hidden><table><tr><td>隐藏表格</td></tr></table></div>
      <table><tr><td>可见表格</td></tr></table>
    `;
    const tables = extractHtmlTables(document);
    expect(tables.map((table) => table.id)).toEqual([1, 2]);
    expect(tables.map((table) => table.matrix)).toEqual([[['']], [['可见表格']]]);
  });

  it('returns an empty scan and an empty matrix when there are no rows', () => {
    document.body.innerHTML = '<p>没有表格</p>';
    expect(extractHtmlTables(document)).toEqual([]);
    expect(readTable('<table></table>')).toEqual([]);
  });
});
