import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { parseDelimited } from '../tests/e2e/parseDelimited.ts';

const release = resolve(process.argv[2] ?? 'dist');
const artifacts = resolve('.test-artifacts');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(artifacts,'browsers');
const { chromium } = await import('@playwright/test');
await mkdir(resolve(artifacts,'package-profiles'),{recursive:true});
const manifest = JSON.parse(await readFile(resolve(release,'manifest.json'),'utf8'));
const packageInfo = JSON.parse(await readFile('package.json','utf8'));
assert.equal(manifest.version,packageInfo.version);
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>TableFlow 合成发布验收</title><table><thead><tr><th>商品</th><th>金额</th><th>备注</th></tr></thead><tbody><tr><td>示例商品</td><td>¥1,299.00</td><td>第一行<br>第二行</td></tr><tr><td>演示商品</td><td>¥299.00</td><td>他说“你好”, CSV</td></tr></tbody></table></html>';
const expected = [['商品','金额','备注'],['示例商品','¥1,299.00','第一行\n第二行'],['演示商品','¥299.00','他说“你好”, CSV']];
const server = createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});response.end(html);});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const address = server.address();
assert.ok(address && typeof address ==='object');
const origin = `http://127.0.0.1:${address.port}`;
const external = [];
let contexts = 0;
async function launch(directory) {
  const profile = await mkdtemp(resolve(artifacts,'package-profiles','chromium-'));
  const context = await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,acceptDownloads:true,
    args:[`--disable-extensions-except=${directory}`,`--load-extension=${directory}`]});
  contexts++;
  context.on('request',(request)=>{const url=new URL(request.url().replace(/^blob:/,''));if(url.protocol!=='chrome-extension:' && url.origin!==origin)external.push(request.url());});
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  return {context,worker,id:new URL(worker.url()).hostname,async close(){await context.close();
    assert.ok(profile.startsWith(resolve(artifacts,'package-profiles')+sep));await rm(profile,{recursive:true,force:true});}};
}
try {
  const original = await launch(release);
  try {
    const actual=await original.worker.evaluate(()=>chrome.runtime.getManifest());
    assert.equal(actual.version,manifest.version);assert.deepEqual(actual.permissions,manifest.permissions);
    assert.equal(actual.host_permissions,undefined);
    const popup=await original.context.newPage();
    await popup.goto(`chrome-extension://${original.id}/${manifest.action.default_popup}`);
    await popup.locator('#onboarding-dialog').waitFor({state:'visible'});
    await popup.locator('#start-using').click();
    await popup.locator('#onboarding-dialog').waitFor({state:'hidden'});
    assert.equal(await original.worker.evaluate(async()=> (await chrome.storage.local.get('onboardingSeen')).onboardingSeen),true);
    await popup.locator('#help').click();
    await popup.locator('#help-dialog').waitFor({state:'visible'});
    assert.ok((await popup.locator('#help-dialog').innerText()).includes(manifest.version));
    await popup.keyboard.press('Escape');
    await popup.locator('#help-dialog').waitFor({state:'hidden'});
    const privacy=await original.context.newPage();
    await privacy.goto(`chrome-extension://${original.id}/privacy.html`);
    assert.match(await privacy.locator('body').innerText(),/TableFlow/);
    await popup.close();await privacy.close();
  } finally {await original.close();}
  // Only a temporary test manifest grants this loopback origin. JS/CSS/icon bytes stay those from the ZIP.
  const copy = await mkdtemp(resolve(artifacts,'packages','smoke-extension-'));
  await cp(release,copy,{recursive:true});
  await writeFile(resolve(copy,'manifest.json'),JSON.stringify({...manifest,host_permissions:['http://127.0.0.1/*']},null,2));
  const tested = await launch(copy);
  try {
    await tested.worker.evaluate(async()=>{await chrome.storage.local.set({onboardingSeen:true,uiLanguage:'zh-CN'});});
    const page=await tested.context.newPage();await page.goto(origin);
    const tabId=await tested.worker.evaluate(async(url)=>{const tab=(await chrome.tabs.query({})).find(entry=>entry.url===url);if(tab?.id===undefined)throw new Error('No package demo tab');return tab.id;},page.url());
    const popup=await tested.context.newPage();
    await tested.worker.evaluate(async(id)=>{await chrome.tabs.update(id,{active:true});},tabId);
    await popup.goto(`chrome-extension://${tested.id}/${manifest.action.default_popup}`);
    await popup.locator('#table-list input').waitFor();
    assert.equal(await popup.locator('#table-list input').count(),1);
    assert.equal(await popup.locator('#selection-state').getAttribute('data-completeness'),'complete');
    await tested.context.grantPermissions(['clipboard-read'],{origin});
    await popup.locator('#copy').click();
    await popup.locator('#action-status').filter({hasText:'已复制'}).waitFor();
    await page.bringToFront();
    const clipboard = await page.evaluate(()=>navigator.clipboard.readText());
    // Windows converts clipboard line endings to CRLF, also inside quoted
    // cells. Compare newline meaning without altering row or cell boundaries.
    assert.deepEqual(parseDelimited(clipboard,'\t').map(row=>row.map(value=>value.replace(/\r\n/g,'\n'))),expected);
    await popup.bringToFront();
    const downloaded=popup.waitForEvent('download');await popup.locator('#export-csv').click();
    const file=await downloaded;const path=await file.path();assert.ok(path);
    const bytes=await readFile(path);assert.deepEqual([...bytes.subarray(0,3)],[239,187,191]);
    assert.deepEqual(parseDelimited(bytes.toString('utf8'),','),expected);
    const apis=await tested.worker.evaluate(async(id)=>{const [result]=await chrome.scripting.executeScript({target:{tabId:id},files:['content.js']});
      const [probe]=await chrome.scripting.executeScript({target:{tabId:id,documentIds:[result.documentId]},func:()=>{const scanner=globalThis.TableFlowScanner;return {benchmark:typeof scanner.benchmarkTables,structural:typeof scanner.generateStructuralSnapshot,serialize:typeof scanner.serializeRows,developer:typeof globalThis.TableFlowDeveloperTools};}});return probe.result;},tabId);
    assert.deepEqual(apis,{benchmark:'undefined',structural:'undefined',serialize:'undefined',developer:'undefined'});
    await popup.close();await page.close();
  } finally {await tested.close();}
  assert.equal(external.length,0);
  await writeFile(resolve(artifacts,'package-smoke.json'),JSON.stringify({passed:true,contexts,originalManifestLoaded:true,
    firstUse:true,help:true,privacy:true,clipboardTsv:true,csvBom:true,exactMatrix:true,developmentApisAbsent:true,
    testGrant:'Temporary copied manifest only: http://127.0.0.1/*',externalRequests:external.length,testedAt:new Date().toISOString()},null,2));
  console.log('Release ZIP extension smoke PASS: original manifest/UI, exact TSV/CSV, no development APIs, no external requests.');
} finally {await new Promise((done)=>server.close(done));}
