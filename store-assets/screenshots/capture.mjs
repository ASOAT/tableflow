/* global chrome */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const artifacts=resolve('.test-artifacts');
const language=process.argv[2]??'zh-CN';
if(!['zh-CN','en'].includes(language))throw new Error('Usage: node store-assets/screenshots/capture.mjs [zh-CN|en]');
const output=resolve(artifacts,'store-captures',language);
const extension=resolve(artifacts,`store-capture-extension-${language}`);
async function removeSafe(path){const absolute=resolve(path);if(!absolute.startsWith(artifacts+sep))throw new Error('Refusing cleanup outside .test-artifacts');await rm(absolute,{recursive:true,force:true});}
await mkdir(output,{recursive:true});await removeSafe(extension);
const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
await cp(resolve('dist'),extension,{recursive:true});
await writeFile(resolve(extension,'manifest.json'),JSON.stringify({...manifest,host_permissions:['http://localhost/*']},null,2));
const profiles=resolve(artifacts,'capture-profiles');await mkdir(profiles,{recursive:true});const profile=await mkdtemp(resolve(profiles,'chromium-'));
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(artifacts,'browsers');
const {chromium,expect}=await import('@playwright/test');
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,acceptDownloads:true,locale:language,viewport:{width:1280,height:800},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
  await worker.evaluate(async uiLanguage=>chrome.storage.local.set({onboardingSeen:true,uiLanguage,autoIconSites:[]}),language);
  const page=await context.newPage();
  async function openDemo(file){await page.goto(`http://localhost:5173/tests/store-demo/${file}`);await page.locator('body[data-demo-ready=true]').waitFor();return worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(item=>item.url===url);if(tab?.id===undefined)throw new Error('Demo tab unavailable');return tab.id;},page.url());}
  async function popupFor(tabId){const popup=await context.newPage();await worker.evaluate(async tab=>chrome.tabs.update(tab,{active:true}),tabId);await popup.goto(`chrome-extension://${id}/${manifest.action.default_popup}`);await popup.locator('#table-list input').first().waitFor();await popup.locator('#table-list input').first().check();return popup;}
  const tabId=await openDemo('index.html');await page.screenshot({path:resolve(output,'synthetic-page-raw.png')});
  const popup=await popupFor(tabId);await popup.screenshot({path:resolve(output,'01-detect-raw.png')});
  await popup.locator('#selection').scrollIntoViewIfNeeded();await popup.screenshot({path:resolve(output,'02-preview-raw.png')});
  await popup.bringToFront();await popup.locator('#copy').click();await expect(popup.locator('#action-status')).toContainText(/已复制|Copied/);await popup.screenshot({path:resolve(output,'03-copy-feedback-raw.png')});
  const pending=popup.waitForEvent('download');await popup.locator('#export-csv').click();const download=await pending;await download.saveAs(resolve(output,'actual-demo.csv'));
  await popup.locator('#help').click();await popup.locator('#help-dialog').waitFor({state:'visible'});await popup.screenshot({path:resolve(output,'05-privacy-raw.png')});await popup.locator('#close-help').click();await popup.close();
  const riskTab=await openDemo('virtual.html');await page.screenshot({path:resolve(output,'visible-window-page-raw.png')});const risk=await popupFor(riskTab);await risk.locator('#copy').click();await risk.locator('#export-confirm').waitFor({state:'visible'});await risk.screenshot({path:resolve(output,'04-integrity-raw.png')});await risk.locator('#cancel-export').click();await risk.close();
  await writeFile(resolve(output,'capture-info.json'),JSON.stringify({version:manifest.version,popup:manifest.action.default_popup,language,capturedAt:new Date().toISOString(),size:'1280x800',status:'RAW MATERIAL ONLY — MANUAL REVIEW REQUIRED',limitations:'Actual Popup extension-tab UI, not Edge native toolbar. No Excel screen is captured; 03-excel.png remains pending real Excel/manual selection.',syntheticData:true,formalDirectoryWritten:false},null,2));
  console.log(`Raw captures only: ${output}. No simulated Excel screen or final store artwork was generated.`);
}finally{await context.close();await removeSafe(profile);await removeSafe(extension);}
