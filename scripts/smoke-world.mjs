/* global requestAnimationFrame */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseDelimited } from '../tests/e2e/parseDelimited.ts';

// Internet observations are deliberately separate from deterministic verify.
// No login, API scraping, crawling, or snapshot of page business values.
const targets=[
  {site:'W3C WAI',type:'原生单层表头',url:'https://www.w3.org/WAI/tutorials/tables/one-header/'},
  {site:'W3C WAI',type:'行列双表头',url:'https://www.w3.org/WAI/tutorials/tables/two-headers/'},
  {site:'W3C WAI',type:'不规则合并表头',url:'https://www.w3.org/WAI/tutorials/tables/irregular/'},
  {site:'W3C WAI',type:'多级表头',url:'https://www.w3.org/WAI/tutorials/tables/multi-level/'},
  {site:'DataTables',type:'官方分页示例',url:'https://datatables.net/examples/core/basic_init/zero_configuration.html'},
  {site:'DataTables',type:'官方复杂表头示例',url:'https://datatables.net/examples/core/basic_init/complex_header.html'},
  {site:'Ant Design',type:'官方Table文档与Demo',url:'https://ant.design/components/table/'},
  {site:'Element Plus',type:'官方Table文档与Demo',url:'https://element-plus.org/en-US/component/table.html'},
  {site:'MUI',type:'官方DataGrid Demo',url:'https://mui.com/x/react-data-grid/'},
  {site:'AG Grid',type:'官方React Quick Start',url:'https://www.ag-grid.com/react-data-grid/getting-started/'},
];
const workspace=resolve('.');
const artifacts=resolve(workspace,'.test-artifacts');
const clone=resolve(artifacts,'smoke-world-extension');
const results=[];
const testedAt=new Date().toISOString();
async function removeInsideArtifacts(path){const absolute=resolve(path);if(!absolute.startsWith(artifacts+sep))throw new Error('Refusing cleanup outside .test-artifacts');await rm(absolute,{recursive:true,force:true});}
function currentProxy(){
  const value=process.env.HTTPS_PROXY??process.env.https_proxy;
  if(value)return value;
  if(process.platform!=='win32')return undefined;
  try{
    const key='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const enabled=execFileSync('reg.exe',['query',key,'/v','ProxyEnable'],{encoding:'utf8',windowsHide:true});
    if(!/ProxyEnable\s+REG_DWORD\s+0x1\b/.test(enabled))return undefined;
    const configured=execFileSync('reg.exe',['query',key,'/v','ProxyServer'],{encoding:'utf8',windowsHide:true});
    const raw=configured.match(/ProxyServer\s+REG_SZ\s+(.+)/)?.[1]?.trim();
    const server=raw?.includes('=')?raw.match(/(?:^|;)https=([^;]+)/)?.[1]:raw;
    return server?(server.includes('://')?server:`http://${server}`):undefined;
  }catch{return undefined;}
}
function cleanUrl(raw){const url=new URL(raw);return url.origin+url.pathname;}
function brief(error){return String(error?.message??error).replace(/https?:\/\/\S+/g,'[URL]').slice(0,220).replace(/\s+/g,' ');}
function cell(text){return String(text??'').replace(/\|/g,'\\|').replace(/\n/g,' ');}
function matrixValid(table){return table.rows.length>0 && table.columns>0 && table.rows.every(row=>row.length===table.columns && row.every(value=>typeof value==='string'));}
async function inspect(worker,tabId){return worker.evaluate(async id=>{const [result]=await chrome.scripting.executeScript({target:{tabId:id},func:()=>globalThis.TableFlowScanner.inspectTables()});if(!result?.result)throw new Error('No engine snapshot');return result.result;},tabId);}

await mkdir(artifacts,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(workspace,'dist/manifest.json'),'utf8'));
const hash=createHash('sha256').update(await readFile(resolve(workspace,'dist/content.js'))).digest('hex');
await removeInsideArtifacts(clone);
await cp(resolve(workspace,'dist'),clone,{recursive:true});
// Exact listed public origins only; all bundled JS remains the actual dist bytes.
// Production manifest is never modified and native permission UI is not tested.
const origins=[...new Set(targets.map(target=>new URL(target.url).origin+'/*'))];
await writeFile(resolve(clone,'manifest.json'),JSON.stringify({...manifest,host_permissions:origins},null,2));
const profiles=resolve(artifacts,'world-profiles');await mkdir(profiles,{recursive:true});
const profile=await mkdtemp(resolve(profiles,'chromium-'));
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(artifacts,'browsers');
const {chromium,expect}=await import('@playwright/test');
const proxy=currentProxy();
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,acceptDownloads:true,locale:'zh-CN',...(proxy?{proxy:{server:proxy}}:{}),args:[`--disable-extensions-except=${clone}`,`--load-extension=${clone}`]});
try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker',{timeout:20000});
  const extensionId=new URL(worker.url()).hostname;
  await worker.evaluate(async()=>chrome.storage.local.set({onboardingSeen:true,uiLanguage:'zh-CN',autoIconSites:[]}));
  for(const target of targets){
    const page=await context.newPage();let popup;
    const record={...target,testDate:testedAt,detectedTables:0,extraction:'未执行',diagnosis:'未执行',export:'未执行',result:'ACCESS_BLOCKED',notes:''};
    try{
      const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:30000});
      record.httpStatus=response?.status();record.finalUrl=cleanUrl(page.url());
      if(response && response.status()>=400)throw new Error(`HTTP ${response.status()}`);
      // Give ordinary scripts a bounded opportunity to render their demo DOM.
      await page.locator('table,[role=grid],[role=table],.ag-root-wrapper').first().waitFor({timeout:8000}).catch(()=>{});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const tabId=await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(candidate=>candidate.url===url);if(tab?.id===undefined)throw new Error('Public page tab unavailable');await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});return tab.id;},page.url());
      const snapshot=await inspect(worker,tabId);
      record.detectedTables=snapshot.tables.length;
      record.globalCodes=snapshot.diagnostics.map(diagnostic=>diagnostic.code);
      record.tables=snapshot.tables.map(table=>({type:table.type,rows:table.diagnostics.extractedRows,columns:table.columns,completeness:table.diagnostics.completeness,warningCodes:table.diagnostics.warnings.map(warning=>warning.code)}));
      if(!snapshot.tables.length){record.result='NO_TABLES';record.extraction='未发现可导出候选';record.notes='可能是访问挑战、尚未加载或当前公开DOM没有可读表格。';continue;}
      if(!snapshot.tables.every(matrixValid)){record.result='MATRIX_ERROR';record.extraction='矩阵类型或宽度不一致';continue;}
      record.extraction='矩阵宽度/文本类型检查通过';
      const candidate=snapshot.tables.find(table=>table.diagnostics.extractedRows>0 && !['ABORTED','MALFORMED_STRUCTURE'].includes(table.metadata.unsupported_reason));
      record.diagnosis=[...new Set(snapshot.tables.map(table=>table.diagnostics.completeness))].join(', ');
      if(!candidate){record.result='BLOCKED_SNAPSHOT';record.notes='结构失败/中止候选没有当作正常数据导出。';continue;}
      record.sample={type:candidate.type,rows:candidate.diagnostics.extractedRows,columns:candidate.columns,completeness:candidate.diagnostics.completeness};
      popup=await context.newPage();
      await worker.evaluate(async id=>chrome.tabs.update(id,{active:true}),tabId);
      await popup.goto(`chrome-extension://${extensionId}/${manifest.action.default_popup}`);
      const radio=popup.locator(`#table-list input[value=${JSON.stringify(candidate.id)}]`);
      await radio.waitFor({timeout:15000});await radio.check();
      const scope=await popup.locator('#selection-state').getAttribute('data-completeness');
      const risk=['visible-only','possibly-incomplete','unknown'].includes(scope);
      await context.grantPermissions(['clipboard-read'],{origin:new URL(page.url()).origin});
      await popup.bringToFront();await popup.locator('#copy').click();
      if(risk){await popup.locator('#export-confirm').waitFor({state:'visible',timeout:5000});await popup.locator('#confirm-export').click();}
      await expect(popup.locator('#action-status')).toContainText(/已复制|Copied/,{timeout:8000});
      await page.bringToFront();
      const tsv=await page.evaluate(()=>navigator.clipboard.readText());
      // Windows clipboard text normalizes line endings, including quoted cell
      // newlines. Preserve every row/cell boundary and compare newline meaning.
      if(JSON.stringify(parseDelimited(tsv,'\t').map(row=>row.map(value=>value.replace(/\r\n/g,'\n'))))!==JSON.stringify(candidate.rows))throw new Error('Actual clipboard TSV did not match inspected snapshot');
      await popup.bringToFront();const downloadPending=popup.waitForEvent('download',{timeout:8000}).then(download=>({download}),error=>({error}));await popup.locator('#export-csv').click();
      if(risk){await popup.locator('#export-confirm').waitFor({state:'visible',timeout:5000});await popup.locator('#confirm-export').click();}
      const downloadResult=await downloadPending;if(downloadResult.error)throw downloadResult.error;const path=await downloadResult.download.path();if(!path)throw new Error('No local CSV output');
      const bytes=await readFile(path);
      if(!bytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])))throw new Error('CSV UTF-8 BOM missing');
      if(JSON.stringify(parseDelimited(bytes.toString('utf8'),','))!==JSON.stringify(candidate.rows))throw new Error('Actual CSV did not match inspected snapshot');
      record.export='选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致';
      record.result=candidate.diagnostics.completeness==='complete'?'PASS_SCOPE':'PARTIAL_SCOPE';
      record.notes='仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。';
    }catch(error){record.notes=brief(error);if(record.detectedTables)record.result='EXPORT_OR_ACCESS_FAILURE';}
    finally{
      if(popup)await popup.close();await page.close();results.push(record);
      await writeFile(resolve(artifacts,'real-world-smoke.json'),JSON.stringify({testedAt,version:manifest.version,contentSha256:hash,method:'actual dist scripts + explicit-origin test manifest grant + original Popup + real clipboard/download; no login/API scraping',results},null,2));
      console.log(`${results.length}/10 ${target.site} ${target.type}: ${record.result}, tables=${record.detectedTables}`);
    }
  }
}finally{await context.close();await removeInsideArtifacts(profile);await removeInsideArtifacts(clone);}
const rows=results.map(entry=>`| [${cell(entry.site)}](${entry.url}) | ${cell(entry.type)} | ${entry.detectedTables} | ${cell(entry.extraction)} | ${cell(entry.diagnosis)} | ${cell(entry.export)} | ${cell(entry.result)} | ${cell(entry.notes)} | ${entry.testDate.slice(0,10)} |`).join('\n');
await writeFile('REAL_WORLD_SMOKE_TEST.md',`# TableFlow 真实公开页面 Smoke Test\n\n测试日期：${testedAt}。实际 dist 版本：${manifest.version}；content.js SHA-256：\`${hash}\`。\n\n独立执行 \`node scripts/smoke-world.mjs\`，不纳入 verify，不把互联网访问失败变成生产构建失败。真实 Chromium 加载实际 dist 字节；测试副本仅授予下列明确站点origin，不改生产manifest、不模拟Chrome API。使用当前系统已有代理（若有），不登录、不绕过访问挑战、不抓取网站接口、不自动翻页。正式Popup路径从manifest动态读取。\n\n检查实际DOM候选的矩阵形状和诊断，选择一个有效候选，通过真正Popup复制TSV及下载CSV，再独立反解析与已读快照比较。PARTIAL_SCOPE表示导出当前范围一致，但结构提示数据可能不完整；PASS_SCOPE也不能证明网站源数据全部完整。当前没有在线人工全量Golden。其他候选没有逐个导出。没有保存网页HTML或业务cell文本；JSON证据仅包含URL、类型、计数、诊断和错误摘要。公开网站自身的网络资源请求不等于扩展上传网页内容。\n\n| Site | Page Type | Detected Tables | Extraction | Completeness Diagnosis | Export | Result | Notes | Test Date |\n| --- | --- | ---: | --- | --- | --- | --- | --- | --- |\n${rows}\n\n结果统计：${results.filter(entry=>entry.result==='PASS_SCOPE').length} PASS_SCOPE，${results.filter(entry=>entry.result==='PARTIAL_SCOPE').length} PARTIAL_SCOPE，${results.filter(entry=>!['PASS_SCOPE','PARTIAL_SCOPE'].includes(entry.result)).length} 访问/发现/导出限制。每页只执行有界普通浏览；页面随时可能变化。此观察不扩大 REAL_COMPONENT_COMPATIBILITY.md 的精确版本回归支持范围。\n`);
console.log('Public-page observation complete. See REAL_WORLD_SMOKE_TEST.md; failures are recorded, not hidden or treated as deterministic CI.');
