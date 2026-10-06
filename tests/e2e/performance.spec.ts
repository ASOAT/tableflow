import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, artifacts, type BenchmarkResult } from './extensionFixtures';

const results: (BenchmarkResult & { dataRows: number })[] = [];

for (const dataRows of [100, 1000, 5000]) {
  test(`performance: ${dataRows} data rows × 20 columns`, async ({ extension }) => {
    const { page, tabId } = await extension.openFixture(`19-large-table.html?rows=${dataRows}`);
    try {
      const measurements = await extension.benchmark(tabId);
      expect(measurements.rows).toBe(dataRows + 1);
      expect(measurements.columns).toBe(20);
      for (const name of ['detectMs', 'extractMs', 'csvMs', 'tsvMs'] as const) {
        expect(Number.isFinite(measurements[name])).toBe(true);
        expect(measurements[name]).toBeGreaterThanOrEqual(0);
      }
      if (dataRows === 1000) expect(measurements.extractMs).toBeLessThan(2000);
      results.push({ dataRows, ...measurements });
      await mkdir(artifacts, { recursive: true });
      await writeFile(resolve(artifacts, 'performance-results.json'), `${JSON.stringify({ results }, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({ dataRows, ...measurements }));
    } finally {
      await page.close();
    }
  });
}
