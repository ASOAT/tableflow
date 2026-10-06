/* global chrome */
import { createServer } from 'node:http';
/* global document */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('tests/store-demo');const artifacts=resolve('.test-artifacts');await mkdir(artifacts,{recursive:true});
async function removeSafe(path){const absolute=resolve(path);if(!absolute.startsWith(artifacts+sep))throw new Error('Refusing cleanup outside artifacts');await rm(absolute,{recursive:true,force:true});}
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://127.0.0.1').pathname);if(!path.startsWith(root+sep))throw new Error('Outside demo');const contents=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[extname(path)]??'application/octet-stream');res.end(contents);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
const clone=resolve(artifacts,'store-demo-check-extension');await removeSafe(clone);await cp(resolve('dist'),clone,{recursive:true});const manifest=JSON.parse(await readFile(resolve(clone,'manifest.json'),'utf8'));await writeFile(resolve(clone,'manifest.json'),JSON.stringify({...manifest,host_permissions:['http://127.0.0.1/*']},null,2));
const profile=await mkdtemp(resolve(artifacts,'demo-profile-'));process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(artifacts,'browsers');const {chromium}=await import('@playwright/test');const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1280,height:800},args:[`--disable-extensions-except=${clone}`,`--load-extension=${clone}`]});const results=[];
try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const page=await context.newPage();
  for(const [file,count,total] of [['index.html',18,undefined],['pagination.html',20,120],['virtual.html',16,10000]]){
    await page.goto(`http://127.0.0.1:${port}/${file}`);await page.locator('body[data-demo-ready=true]').waitFor();
    const snapshot=await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(tab=>tab.url===url);await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.TableFlowScanner.inspectTables()});return result.result;},page.url());
    assert.equal(snapshot.tables.length,1);const table=snapshot.tables[0];assert.equal(table.columns,6);assert.equal(table.diagnostics.extractedRows,count);assert.equal(table.rows[1][0],'DEMO-00001');assert.equal(table.rows[1][1],'轻量保温杯');assert.equal(table.rows[1][3],'¥1,299.00');
    if(total!==undefined){assert.equal(table.diagnostics.expectedRows,total);assert.notEqual(table.diagnostics.completeness,'complete');assert.ok(table.diagnostics.warnings.some(warning=>warning.code==='ROW_COUNT_MISMATCH'));}else assert.equal(table.diagnostics.completeness,'complete');
    if(file==='virtual.html'){assert.equal(table.metadata.virtualized,true);const scroller=page.locator('.virtual-scroll');await scroller.evaluate(element=>element.scrollTop=440);await page.waitForFunction(()=>document.querySelector('[role=grid] [role=row][aria-rowindex="12"]'));assert.equal(await page.locator('.virtual-row').count(),16);}
    await page.screenshot({path:resolve(artifacts,`store-demo-${file.replace('.html','')}.png`)});results.push({file,rows:count,columns:6,expectedRows:total,completeness:table.diagnostics.completeness,result:'PASS'});
  }
  await writeFile(resolve(artifacts,'store-demo-results.json'),JSON.stringify({version:manifest.version,results},null,2));console.log('Three synthetic store demo pages passed real extension checks. Screenshots are raw previews only.');
}finally{await context.close();server.close();await removeSafe(profile);await removeSafe(clone);}
