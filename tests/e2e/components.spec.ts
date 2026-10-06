import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, workspace, artifacts, componentOrigin, type CandidateView, type ExtensionHarness } from './extensionFixtures';
import { parseDelimited } from './parseDelimited';

interface Scenario { id: string; family: string; label: string; expectedFile: string; ui: boolean; }
interface Golden {
  type: string; mode: string; rows: string[][]; columns: number; headerRows: number;
  completeness: string; expectedRows: number; expectedColumns?: number; warnings: string[];
}
const scenarios = JSON.parse(await readFile(resolve(workspace,'tests/component-lab/scenarios.json'),'utf8')) as Scenario[];
const labPackage = JSON.parse(await readFile(resolve(workspace,'tests/component-lab/package.json'),'utf8')) as { dependencies: Record<string,string> };
const results: Record<string,unknown>[] = [];

async function sideEffects(page: Page) {
  return page.evaluate(() => ({
    focus: document.activeElement?.id,
    window: [scrollX,scrollY],
    scroll: [...document.querySelectorAll('#component-surface *')].filter(element=>element.clientHeight>0 && (element.scrollHeight>element.clientHeight+1 || element.scrollWidth>element.clientWidth+1))
      .map(element=>({tag:element.tagName,class:element.className,top:element.scrollTop,left:element.scrollLeft})),
    checked: [...document.querySelectorAll('#component-surface input[type=checkbox]')].map(input=>(input as HTMLInputElement).checked),
    expanded: document.querySelectorAll('.ant-table-row-expand-icon-expanded,.el-table__expand-icon--expanded,[aria-expanded=true]').length,
    sorting: [...document.querySelectorAll('#component-surface [aria-sort],#component-surface .ascending,#component-surface .descending')].map(element=>({class:element.className,sort:element.getAttribute('aria-sort')})),
    componentState: (window as typeof window & { __labComponentState?: unknown }).__labComponentState,
  }));
}

async function actualPopupExports(extension: ExtensionHarness, page: Page, tabId: number, candidate: CandidateView, collect: boolean) {
  const popup = await extension.openPopup(tabId);
  try {
    await expect(popup.locator('#table-list input')).toHaveCount(1);
    await popup.locator('#table-list input').check();
    if (collect) {
      await expect(popup.locator('#collect')).toBeVisible();
      await popup.locator('#collect').click();
      await expect(popup.locator('#cancel-collect')).toBeHidden({timeout:35_000});
      await expect(popup.locator('#selection-summary')).toContainText(`${candidate.diagnostics.extractedRows} 行`);
    }
    await expect(popup.locator('#selection-state')).toHaveAttribute('data-completeness',candidate.diagnostics.completeness);
    await expect(popup.locator('#selection-summary')).toContainText(`${candidate.diagnostics.extractedRows} 行`);
    await expect(popup.locator('#selection-summary')).toContainText(`${candidate.diagnostics.extractedColumns} 列`);
    if(candidate.diagnostics.completeness==='current-page')await expect(popup.locator('#table-warnings')).toContainText(`${candidate.diagnostics.expectedRows}`);
    if(candidate.diagnostics.warnings.some(warning=>warning.code==='COLUMN_COUNT_MISMATCH'))await expect(popup.locator('#table-warnings')).toContainText(`${candidate.diagnostics.expectedColumns} 列`);
    const risk=['visible-only','possibly-incomplete','unknown'].includes(candidate.diagnostics.completeness);
    await extension.context.grantPermissions(['clipboard-read'],{origin:componentOrigin});
    await page.bringToFront();
    const clipboardBefore=await page.evaluate(()=>navigator.clipboard.readText());
    await popup.bringToFront();
    await popup.locator('#copy').click();
    if(risk){
      await expect(popup.locator('#export-confirm')).toBeVisible();
      await popup.locator('#cancel-export').click();
      await expect(popup.locator('#export-confirm')).toBeHidden();
      await page.bringToFront();
      expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(clipboardBefore);
      await popup.bringToFront();
      await popup.locator('#copy').click();
      await expect(popup.locator('#export-confirm')).toBeVisible();
      await popup.locator('#confirm-export').click();
    } else await expect(popup.locator('#export-confirm')).toBeHidden();
    await expect(popup.locator('#action-status')).toContainText('已复制');
    await page.bringToFront();
    expect(parseDelimited(await page.evaluate(()=>navigator.clipboard.readText()),'\t')).toEqual(candidate.rows);
    await popup.bringToFront();
    let downloads=0;
    popup.on('download',()=>{downloads+=1;});
    const pending=popup.waitForEvent('download');
    await popup.locator('#export-csv').click();
    if(risk){
      await expect(popup.locator('#export-confirm')).toBeVisible();
      expect(downloads).toBe(0);
      await popup.locator('#cancel-export').click();
      await expect(popup.locator('#export-confirm')).toBeHidden();
      expect(downloads).toBe(0);
      await popup.locator('#export-csv').click();
      await expect(popup.locator('#export-confirm')).toBeVisible();
      expect(downloads).toBe(0);
      await popup.locator('#confirm-export').click();
    }
    const download=await pending;
    expect(downloads).toBe(1);
    const path=await download.path();
    if(!path)throw new Error('No real component CSV download file was created.');
    const bytes=await readFile(path);
    expect([...bytes.subarray(0,3)]).toEqual([0xEF,0xBB,0xBF]);
    expect(parseDelimited(bytes.toString('utf8'),',')).toEqual(candidate.rows);
  } finally { await popup.close(); }
}

for(const scenario of scenarios){
  test(`real ${scenario.family}/${scenario.id}: ${scenario.label}`,async({extension})=>{
    const golden=JSON.parse(await readFile(resolve(workspace,'tests/expected/real',scenario.expectedFile),'utf8')) as Golden;
    const {page,tabId}=await extension.openComponent(scenario.family,scenario.id);
    try{
      await page.locator('#focus-sentinel').focus();
      const before=await sideEffects(page);
      let snapshot=await extension.inspect(tabId);
      if(golden.mode==='empty')expect(snapshot.tables).toHaveLength(0);
      else {
        expect(snapshot.tables).toHaveLength(1);
        let candidate=snapshot.tables[0]!;
        expect(candidate.type).toBe(golden.type);
        if(golden.mode==='unsupported-pinning'){
          await expect(page.locator('#community-limit')).toBeVisible();
          expect(await page.evaluate(()=>(window as typeof window & {__labComponentState?:{pinningAvailable:boolean}}).__labComponentState?.pinningAvailable)).toBe(false);
        }
        if(golden.mode==='collect'){
          expect(candidate.metadata.virtualized).toBe(true);
          expect(candidate.diagnostics.completeness).not.toBe('complete');
          candidate=await extension.collect(tabId,candidate.id);
        }
        if(golden.mode==='horizontal'){
          expect(candidate.diagnostics.completeness).not.toBe('complete');
          expect(candidate.diagnostics.expectedColumns).toBe(golden.columns);
          expect(candidate.diagnostics.extractedColumns).toBeLessThan(golden.columns);
          const positions=candidate.rows[0]!.map(label=>golden.rows[0]!.indexOf(label));
          expect(positions.every(index=>index>=0)).toBe(true);
          expect(new Set(positions).size).toBe(positions.length);
          expect(candidate.rows).toEqual(golden.rows.map(row=>positions.map(index=>row[index]!)));
        } else {
          expect(candidate.rows).toEqual(golden.rows);
          expect(candidate.columns).toBe(golden.columns);
          expect(candidate.metadata.headerRows).toBe(golden.headerRows);
          expect(candidate.diagnostics.completeness).toBe(golden.completeness);
          expect(candidate.diagnostics.extractedRows).toBe(golden.rows.length-golden.headerRows-(scenario.id==='A10'||scenario.id==='E7'?1:0));
        }
        for(const code of golden.warnings)expect(candidate.diagnostics.warnings.map(warning=>warning.code)).toContain(code);
        if(golden.expectedColumns!==undefined)expect(candidate.diagnostics.expectedColumns).toBe(golden.expectedColumns);
        if(golden.completeness==='current-page')expect(candidate.diagnostics.expectedRows).toBe(golden.expectedRows);
        await expect.poll(()=>sideEffects(page)).toEqual(before);
        const [csv,tsv]=await Promise.all([extension.serialize(tabId,candidate.rows,'csv'),extension.serialize(tabId,candidate.rows,'tsv')]);
        expect(parseDelimited(csv,',')).toEqual(candidate.rows);
        expect(parseDelimited(tsv,'\t')).toEqual(candidate.rows);
        if(scenario.ui)await actualPopupExports(extension,page,tabId,candidate,golden.mode==='collect');
        results.push({family:scenario.family,scenario:scenario.id,label:scenario.label,version:labPackage.dependencies[{antd:'antd','element-plus':'element-plus',mui:'@mui/x-data-grid','ag-grid':'ag-grid-community'}[scenario.family]!],extraction:golden.mode==='unsupported-pinning'?'NOT TESTED / PRO ONLY':'PASS',completeness:candidate.diagnostics.completeness,e2e:scenario.ui?'PASS':'ENGINE+SERIALIZERS',warnings:candidate.diagnostics.warnings.map(w=>w.code),rows:candidate.diagnostics.extractedRows,columns:candidate.diagnostics.extractedColumns});
      }
      if(golden.mode==='empty')results.push({family:scenario.family,scenario:scenario.id,label:scenario.label,version:labPackage.dependencies.antd,rows:0,columns:0,notes:'Real empty component renders no exportable business rows.',extraction:'PASS',completeness:'empty',e2e:'ENGINE'});
      await writeFile(resolve(artifacts,'component-results.json'),`${JSON.stringify({results},null,2)}\n`);
      snapshot=await extension.inspect(tabId);
      expect(snapshot.tables.every(table=>table.rows.every(row=>row.length===table.columns))).toBe(true);
    } finally {await page.close();}
  });
}

test('real component safety: unmount during AG virtual collection cannot return complete data',async({extension})=>{
  const {page,tabId}=await extension.openComponent('ag-grid','G2');
  try{
    const initial=(await extension.inspect(tabId)).tables[0]!;
    const pending=extension.collect(tabId,initial.id,{maxRows:300,maxIterations:30,timeoutMs:5000});
    await page.locator('#unmount').click();
    const result=await pending;
    expect(result.diagnostics.completeness).not.toBe('complete');
    expect(result.diagnostics.warnings.map(warning=>warning.code)).toContain('COLLECTION_ABORTED');
    expect((await extension.inspect(tabId)).tables).toHaveLength(0);
  }finally{await page.close();}
});

test('real component safety: changing AG row count cannot silently claim the old dataset is complete',async({extension})=>{
  const {page,tabId}=await extension.openComponent('ag-grid','G2');
  try{
    const initial=(await extension.inspect(tabId)).tables[0]!;
    const pending=extension.collect(tabId,initial.id,{maxRows:300,maxIterations:50,timeoutMs:5000});
    await page.locator('#grow-rows').click();
    const result=await pending;
    await writeFile(resolve(artifacts,'component-row-change-probe.json'),`${JSON.stringify({initial,result,semanticCounts:await page.locator('#component-surface [role=grid]').evaluateAll(grids=>grids.map(grid=>grid.getAttribute('aria-rowcount')))},null,2)}\n`);
    expect(result.diagnostics.expectedRows).toBe(130);
    if(result.diagnostics.completeness==='complete'){
      expect(result.diagnostics.extractedRows).toBe(130);
      expect(result.rows.slice(1)).toEqual(Array.from({length:130},(_,index)=>[`R${String(index+1).padStart(5,'0')}`,`商品 ${index+1}`,'杭州']));
    }else expect(result.diagnostics.warnings.map(warning=>warning.code)).toContain('ROW_COUNT_MISMATCH');
  }finally{await page.close();}
});
