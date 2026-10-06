import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const manifest = JSON.parse(await readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
await readFile(new URL(`../dist/${manifest.background.service_worker}`, import.meta.url));
await readFile(new URL('../dist/auto-icons.js', import.meta.url));
const popupHtml = await readFile(new URL(`../dist/${manifest.action.default_popup}`, import.meta.url), 'utf8');
assert.match(popupHtml, /<script[^>]+src="[^"]+\.js"/);
const popupUrl = new URL(`../dist/${manifest.action.default_popup}`, import.meta.url);
for (const [, asset] of popupHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
  await readFile(new URL(asset, popupUrl));
}

// Run the actual classic bundle twice, just as repeated Popup scans inject it.
const code = await readFile(new URL('../dist/content.js', import.meta.url), 'utf8');
const dom = new JSDOM('<table><tr><th>名称</th><th>备注</th></tr><tr><td>上海</td><td>hello, "Excel"</td></tr></table>');
const context = { document: dom.window.document };
runInNewContext(code, context);
assert.equal(context.TableFlowScanner.benchmarkTables, undefined);
assert.equal(context.TableFlowScanner.serializeRows, undefined);
assert.equal(context.TableFlowScanner.generateStructuralSnapshot, undefined);
const firstInspection = context.TableFlowScanner.inspectTables();
runInNewContext(code, context);
const secondInspection = context.TableFlowScanner.inspectTables();
assert.equal(secondInspection.tables[0].id, firstInspection.tables[0].id);
assert.equal(secondInspection.tables[0].metadata.complete, true);
assert.equal(secondInspection.tables[0].type, 'native-table');
assert.equal(JSON.stringify(secondInspection).includes('sourceElement'), false);
const { tables } = context.TableFlowScanner.scanTables();
assert.equal(tables.length, 1);
assert.equal(tables[0].rowCount, 2);
assert.equal(tables[0].columnCount, 2);
assert.equal(tables[0].matrix[1][1], 'hello, "Excel"');
dom.window.close();

// Exercise the built Popup and content bundle together with browser API stubs.
// This verifies production output; it is not a real Edge permission/UI test.
const popupScript = popupHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
assert.ok(popupScript, 'Popup must have a built JavaScript entry.');
const popupCode = await readFile(new URL(popupScript, popupUrl), 'utf8');
const fixture = new JSDOM(`
  <table><tr><th>第一张表</th></tr><tr><td>中文</td></tr></table>
  <table><tr><td>&lt;img src=x onerror="alert(1)"&gt;</td><td>第二张表</td></tr><tr><td>A</td><td>B</td></tr></table>
`, { runScripts: 'outside-only' });
const popup = new JSDOM(popupHtml, {
  runScripts: 'outside-only',
  url: 'https://tableflow-extension.invalid/popup.html',
});
let activeUrl = 'https://example.com/';
let injectionCount = 0;
popup.window.chrome = {
  runtime: { getManifest: () => manifest, getURL: (path) => `https://tableflow-extension.invalid/${path}` },
  tabs: { query: async () => [{ id: 12, url: activeUrl }] },
  storage: { local: { get: async () => ({ autoIconSites: [],onboardingSeen:true,uiLanguage:'zh-CN' }), set: async () => {} } },
  permissions: { contains: async () => false },
  scripting: {
    executeScript: async (injection) => {
      injectionCount += 1;
      if (injection.files) {
        assert.deepEqual(Array.from(injection.files), ['content.js']);
        fixture.window.eval(code);
        return [{ frameId: 0, documentId: 'fixture-document' }];
      }
      assert.deepEqual(Array.from(injection.target.documentIds), ['fixture-document']);
      // Chromium serializes this function instead of keeping the Popup closure.
      fixture.window.tableflowTestArgs = injection.args ?? [];
      const result = fixture.window.eval(`(${injection.func.toString()})(...tableflowTestArgs)`);
      delete fixture.window.tableflowTestArgs;
      return [{ frameId: 0, documentId: 'fixture-document', result }];
    },
  },
};

const popupDocument = popup.window.document;
const rescan = popupDocument.querySelector('#rescan');
const status = popupDocument.querySelector('#status');
async function waitForScan() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!rescan.disabled && ['success','empty','error'].includes(status.dataset.state)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Built Popup scan did not finish.');
}

try {
  popup.window.eval(popupCode);
  await waitForScan();
  assert.equal(status.dataset.state, 'success');
  const options = popupDocument.querySelectorAll('input[name="table"]');
  assert.equal(options.length, 2);
  assert.equal(popupDocument.querySelector('#selection-title').textContent, '表格 1');

  options[1].checked = true;
  options[1].dispatchEvent(new popup.window.Event('change', { bubbles: true }));
  assert.equal(popupDocument.querySelector('#selection-title').textContent, '表格 2');
  assert.equal(popupDocument.querySelector('#matrix-preview td').textContent, '<img src=x onerror="alert(1)">');
  assert.equal(popupDocument.querySelector('img'), null, 'Table text must not create HTML elements.');

  fixture.window.document.body.replaceChildren();
  rescan.click();
  await waitForScan();
  assert.equal(status.dataset.state, 'empty');
assert.match(status.textContent, /没有找到数据表/);
  assert.equal(popupDocument.querySelector('#table-list').children.length, 0);
  assert.equal(popupDocument.querySelector('#selection').hidden, true);

  activeUrl = 'edge://extensions/';
  const priorInjections = injectionCount;
  rescan.click();
  await waitForScan();
  assert.equal(status.dataset.state, 'error');
  assert.match(status.textContent, /浏览器内部页面无法扫描/);
  assert.equal(injectionCount, priorInjections);
} finally {
  popup.window.close();
  fixture.window.close();
}
console.log('Built MV3 manifest, repeatable content bundle and Popup scan/selection/empty/error states verified.');
