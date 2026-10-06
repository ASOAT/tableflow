/* global document */
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage();
const results = [];
for (const [family, scenarios] of [['antd',['A7','A8','A10','A2']],['element-plus',['E4','E5','E6','E7']],['mui',['M1','M3','M4','M7']],['ag-grid',['G2','G4','G5']]]) {
  for (const scenario of scenarios) {
    const errors = [];
    const onError = error => errors.push(error.message);
    page.on('pageerror',onError);
    await page.goto(`http://localhost:4175/?family=${family}&case=${scenario}`);
    await page.locator('body[data-lab-ready="true"]').waitFor();
    const dom = await page.evaluate(() => ({
      tables: [...document.querySelectorAll('#component-surface table')].map(table => ({class:table.className,html:table.outerHTML.slice(0,6500),rows:table.rows.length})),
      grids: [...document.querySelectorAll('#component-surface [role="grid"]')].map(grid=>({html:grid.outerHTML.slice(0,2200),rowcount:grid.getAttribute('aria-rowcount'),colcount:grid.getAttribute('aria-colcount')})),
      ariaRows:[...document.querySelectorAll('#component-surface [role="row"]')].slice(0,3).map(row=>row.outerHTML.slice(0,4800)),
      pagination:[...document.querySelectorAll('.ant-pagination,.el-pagination,.MuiTablePagination-root')].map(node=>node.outerHTML.slice(0,2500)),
      text:document.querySelector('#component-surface')?.textContent?.slice(0,1000),
    }));
    results.push({family,scenario,errors,...dom});
    page.off('pageerror',onError);
    console.log(`${family}/${scenario}: ${dom.tables.length} tables, ${dom.grids.length} grids, errors ${errors.length}`);
  }
}
await browser.close();
await mkdir('.test-artifacts',{recursive:true});
await writeFile('.test-artifacts/component-dom-probes.json',JSON.stringify(results,null,2));
