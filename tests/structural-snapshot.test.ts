import { afterEach, describe, expect, it } from 'vitest';
import { sanitizeStructuralSnapshot } from '../src/shared/structural-snapshot';
import { generateStructuralSnapshot } from '../src/content/structural-snapshot';
import { inspectTables } from '../src/content/engine';

afterEach(() => document.body.replaceChildren());
function root(markup: string): Element {
  document.body.innerHTML = markup;
  return document.body.firstElementChild!;
}
describe('default structural snapshot sanitization', () => {
  it('preserves structural hierarchy, known roles and numeric ARIA without text or identity', () => {
    const result = sanitizeStructuralSnapshot(root('<div role="grid" class="MuiDataGrid-root private-John" aria-rowcount="12" aria-colcount="2" id="person-Alice"><div role="row" aria-rowindex="2" data-row-key="ORDER-338"><div role="gridcell" aria-colindex="1" data-field="mobile">张三 13812345678</div><div role="gridcell" aria-colindex="2">alice@example.com</div></div></div>'));
    expect(result.root).toEqual({ tag: 'div', attributes: { role: 'grid', 'aria-rowcount': 12, 'aria-colcount': 2 },
      classes: ['MuiDataGrid-root'], children: [{ tag: 'div', attributes: { role: 'row', 'aria-rowindex': 2 }, children: [
        { tag: 'div', attributes: { role: 'gridcell', 'aria-colindex': 1 }, dataAttributes: ['data-field'] },
        { tag: 'div', attributes: { role: 'gridcell', 'aria-colindex': 2 } },
      ] }] });
    const json = JSON.stringify(result);
    for (const sensitive of ['张三', '13812345678', 'alice@example.com', 'private-John', 'person-Alice', 'ORDER-338', 'mobile', 'data-row-key']) expect(json).not.toContain(sensitive);
  });
  it('excludes every sensitive attribute name, values, URL, handlers, and arbitrary ARIA label', () => {
    const element = root('<table class="ant-table auth-user-998" data-token="SECRET1" data-auth="SECRET2" data-secret="SECRET3" data-password="SECRET4" data-session="SECRET5" data-cookie="SECRET6" data-column-key="SECRET7" aria-keyshortcuts="SECRET8" title="private title" aria-label="private label" onclick="privateHandler()"><tr><td colspan="2"><a href="https://private.example/path?token=abc#secret">张三地址</a><input value="PRIVATE_INPUT"><textarea>PRIVATE_TEXTAREA</textarea><iframe src="https://private.example/?session=abc" srcdoc="PRIVATE_SRCDOC"></iframe></td></tr></table>');
    const snapshot = sanitizeStructuralSnapshot(element);
    const json = JSON.stringify(snapshot);
    expect(snapshot.root?.classes).toEqual(['ant-table']);
    expect(snapshot.root?.children?.[0]?.children?.[0]?.children?.[0]?.attributes).toEqual({ colspan: 2 });
    for (const sensitive of ['SECRET', 'private', 'PRIVATE', '张三', 'token', 'auth', 'password', 'session', 'cookie', 'keyshortcuts', 'value', 'href', 'srcdoc', 'onclick', 'title', 'aria-label']) expect(json).not.toContain(sensitive);
  });
  it('omits hidden, clipped, script, style and template subtrees', () => {
    const element = root('<div><section hidden role="grid" aria-rowcount="888"><table><tr><td>hidden-secret</td></tr></table></section><section aria-hidden=" TRUE " role="grid" aria-rowcount="777"></section><section style="display:none" role="grid" aria-rowcount="666"></section><section style="position:absolute;overflow:hidden;width:1px;height:1px;clip:rect(0px,0px,0px,0px)" aria-rowcount="555"></section><input type="hidden" value="private"><script>script-private</script><style>.private{display:block}</style><template><table>template-private</table></template><table><tr><th>名称</th></tr><tr><td>普通数据</td></tr></table></div>');
    const snapshot = sanitizeStructuralSnapshot(element);
    expect(snapshot.root?.children?.map((node) => node.tag)).toEqual(['table']);
    expect(JSON.stringify(snapshot)).not.toMatch(/888|777|666|555|private|普通数据|名称/);
  });
  it('retains only allowlisted data attribute presence, never attribute values', () => {
    const snapshot = sanitizeStructuralSnapshot(root('<div data-row-index="12345" data-virtualized="true" data-header="private header" data-field="email" data-id="CUSTOMER999" data-user="Alice" data-col-key="private" data-api-key="private"></div>'));
    expect(snapshot.root?.dataAttributes).toEqual(['data-field', 'data-header', 'data-row-index', 'data-virtualized']);
    expect(JSON.stringify(snapshot)).not.toMatch(/12345|email|CUSTOMER999|Alice|private|data-id|data-user|data-col-key|data-api-key/);
  });
  it('rejects arbitrary framework-like class suffixes and invalid numeric or role values', () => {
    const snapshot = sanitizeStructuralSnapshot(root('<div class="ag-root ag-row-userAlice MuiDataGrid-personBob ant-table-userCarol" role="grid privateAlice" aria-rowindex="alice" aria-colindex="999999999999" aria-rowcount="-1"></div>'));
    expect(snapshot.root).toEqual({ tag: 'div', classes: ['ag-root'], attributes: { 'aria-rowcount': -1 } });
  });
  it('bounds node counts and depths and explicitly records truncation', () => {
    const element = root('<div>' + Array.from({ length: 20 }, () => '<span><b>private</b></span>').join('') + '</div>');
    const snapshot = sanitizeStructuralSnapshot(element, { maxNodes: 6 });
    expect(snapshot.nodeCount).toBe(6);
    expect(snapshot.truncated).toBe(true);
    const depthLimited = sanitizeStructuralSnapshot(root('<div><section><article><span>private</span></article></section></div>'), { maxDepth: 1 });
    expect(depthLimited.nodeCount).toBe(2);
    expect(depthLimited.truncated).toBe(true);
  });
  it('does not mutate the source DOM or live input state', () => {
    const element = root('<table><tr><td><input type="checkbox" checked><input value="private"><textarea>private</textarea></td></tr></table>');
    const before = element.outerHTML;
    sanitizeStructuralSnapshot(element);
    expect(element.outerHTML).toBe(before);
    expect(element.querySelector('input')?.checked).toBe(true);
  });
  it('generates the developer snapshot locally for a detected candidate', () => {
    root('<table><tr><th>姓名</th></tr><tr><td>张三</td></tr></table>');
    const table = inspectTables().tables[0]!;
    const snapshot = generateStructuralSnapshot(table.id);
    expect(snapshot.root?.tag).toBe('table');
    expect(snapshot.nodeCount).toBeGreaterThan(1);
    expect(JSON.stringify(snapshot)).not.toMatch(/姓名|张三/);
    expect(() => generateStructuralSnapshot('missing')).toThrow('重新扫描');
  });
});
