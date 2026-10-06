import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, artifacts } from './extensionFixtures';

const results:Record<string,unknown>[]=[];
for(const dataRows of [1000,5000]){
  test(`real component performance: Ant ${dataRows} × 20`,async({extension})=>{
    const {page,tabId}=await extension.openComponent('antd',`P${dataRows}`);
    try{
      const measurement=await extension.benchmark(tabId);
      expect(measurement.rows).toBe(dataRows+1);
      expect(measurement.columns).toBe(20);
      for(const name of ['detectMs','extractMs','csvMs','tsvMs'] as const){expect(Number.isFinite(measurement[name])).toBe(true);expect(measurement[name]).toBeGreaterThanOrEqual(0);}
      expect(Number.isFinite(measurement.diagnosticsMs)).toBe(true);
      expect(measurement.diagnosticsMs).toBeGreaterThanOrEqual(0);
      results.push({family:'antd',dataRows,...measurement});
      await writeFile(resolve(artifacts,'component-performance-results.json'),`${JSON.stringify({results},null,2)}\n`);
    }finally{await page.close();}
  });
}

test('real component performance: AG 10000 virtual rows, bounded collection',async({extension})=>{
  const {page,tabId}=await extension.openComponent('ag-grid','P10000');
  try{
    const benchmark=await extension.benchmark(tabId);
    const initial=(await extension.inspect(tabId)).tables[0]!;
    expect(initial.diagnostics.expectedRows).toBe(10000);
    const started=Date.now();
    const result=await extension.collect(tabId,initial.id,{maxRows:300,maxIterations:30,timeoutMs:5000});
    expect(result.diagnostics.completeness).not.toBe('complete');
    expect(result.diagnostics.extractedRows).toBeLessThanOrEqual(300);
    expect(result.diagnostics.extractedRows).toBeGreaterThan(initial.diagnostics.extractedRows);
    expect(result.diagnostics.warnings.map(warning=>warning.code)).toContain('COLLECTION_LIMIT');
    expect(Date.now()-started).toBeLessThan(10_000);
    results.push({family:'ag-grid',dataRows:10000,...benchmark,collectionMs:Date.now()-started,collectedRows:result.diagnostics.extractedRows,status:result.diagnostics.completeness});
    await writeFile(resolve(artifacts,'component-performance-results.json'),`${JSON.stringify({results},null,2)}\n`);
  }finally{await page.close();}
});
