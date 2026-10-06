import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixtures } from '../fixtures/catalog';
import { test, expect, launchExtension, workspace, fixtureOrigin, type CandidateView } from './extensionFixtures';
import { parseDelimited } from './parseDelimited';

interface GoldenTable {
  type: string;
  rows: string[][];
  columns: number;
  headerRows: number;
  complete: boolean;
}

interface GoldenOutput {
  tables: GoldenTable[];
  diagnostics?: { code: string; certainty?: string }[];
}

function normalizeCandidate(candidate: CandidateView): GoldenTable {
  return {
    type: candidate.type,
    rows: candidate.rows,
    columns: candidate.columns,
    headerRows: candidate.metadata.headerRows,
    complete: candidate.metadata.complete,
  };
}

function orderTables(tables: GoldenTable[]): GoldenTable[] {
  // Collection order is not the matrix contract; row and column order remain exact.
  return [...tables].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

test('production extension loads with its original minimal manifest', async () => {
  const manifest = JSON.parse(await readFile(resolve(workspace, 'dist/manifest.json'), 'utf8')) as chrome.runtime.Manifest;
  expect(manifest.manifest_version).toBe(3);
  expect([...(manifest.permissions ?? [])].sort()).toEqual(['activeTab', 'scripting', 'storage'].sort());
  expect(manifest.host_permissions ?? []).toEqual([]);
  expect(manifest.permissions).not.toContain('<all_urls>');
  expect([...(manifest.optional_host_permissions ?? [])].sort()).toEqual(['http://*/*', 'https://*/*'].sort());

  const extension = await launchExtension(resolve(workspace, 'dist'));
  try {
    const actual = await extension.worker.evaluate(() => chrome.runtime.getManifest());
    const localizedName = await extension.worker.evaluate(() => chrome.i18n.getMessage('extensionName'));
    expect(localizedName).not.toBe('');
    expect(actual.name).toBe(localizedName);
    expect(actual.version).toBe(manifest.version);
    expect(actual.background).toEqual(expect.objectContaining({ service_worker: 'background.js' }));
    expect(actual.host_permissions ?? []).toEqual([]);
    expect(actual.permissions).toEqual(manifest.permissions);
    expect(extension.worker.url()).toBe(`chrome-extension://${extension.extensionId}/background.js`);
  } finally {
    await extension.close();
    expect(extension.unexpectedRequests).toEqual([]);
  }
});

test('independent delimited parser handles quotes, blank cells and multiline Unicode', () => {
  expect(parseDelimited('\uFEFF姓名,说明,空\r\n张三,"他说 ""你好"",第一行\n第二行",', ','))
    .toEqual([['姓名', '说明', '空'], ['张三', '他说 "你好",第一行\n第二行', '']]);
  expect(parseDelimited('"a\tb"\t"""quote"""\t\r\n中文\t2\t', '\t'))
    .toEqual([['a\tb', '"quote"', ''], ['中文', '2', '']]);
  expect(() => parseDelimited('"unterminated', ',')).toThrow('unterminated');
});

for (const fixture of fixtures) {
  test(`${fixture.file}: ${fixture.label}`, async ({ extension }) => {
    const expected = JSON.parse(await readFile(resolve(workspace, 'tests/expected', fixture.expectedFile), 'utf8')) as GoldenOutput;
    const { page, tabId } = await extension.openFixture(fixture.file);
    try {
      const snapshot = await extension.inspect(tabId);
      expect(snapshot.tables).toHaveLength(expected.tables.length);

      if (fixture.file === '12-virtual-scroll.html') {
        const initial = snapshot.tables[0];
        expect(initial).toBeDefined();
        if (!initial) throw new Error('The virtual grid was not detected.');
        expect(initial.rows).toHaveLength(21);
        expect(initial.metadata.complete).toBe(false);
        expect(initial.metadata.virtualized).toBe(true);
        const viewport = page.locator('.virtual-viewport');
        const originalScroll = await viewport.evaluate((element) => element.scrollTop);
        const initialNodeCount = await page.locator('[role="row"][data-row-key]').count();
        expect(initialNodeCount).toBe(20);

        const collected = await extension.collect(tabId, initial.id);
        expect(collected.rows.length).toBeGreaterThan(initial.rows.length);
        expect(collected.rows).toHaveLength(121);
        expect(collected.metadata.complete).toBe(true);
        await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(originalScroll);
        expect(await page.locator('[role="row"][data-row-key]').count()).toBe(initialNodeCount);
        snapshot.tables[0] = collected;
      }

      expect(orderTables(snapshot.tables.map(normalizeCandidate))).toEqual(orderTables(expected.tables));
      expect(new Set(snapshot.tables.map((candidate) => candidate.id)).size).toBe(snapshot.tables.length);
      for (const diagnostic of expected.diagnostics ?? []) {
        expect(snapshot.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining(diagnostic)]));
      }

      for (const candidate of snapshot.tables) {
        expect(typeof candidate.id).toBe('string');
        expect(candidate.id.length).toBeGreaterThan(0);
        expect(Number.isFinite(candidate.confidence)).toBe(true);
        expect(candidate.confidence).toBeGreaterThanOrEqual(0);
        expect(candidate.confidence).toBeLessThanOrEqual(1);
        expect(candidate.rows.every((row) => row.length === candidate.columns)).toBe(true);
        const [csv, tsv] = await Promise.all([
          extension.serialize(tabId, candidate.rows, 'csv'),
          extension.serialize(tabId, candidate.rows, 'tsv'),
        ]);
        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(tsv.startsWith('\uFEFF')).toBe(false);
        expect(parseDelimited(csv, ',')).toEqual(candidate.rows);
        expect(parseDelimited(tsv, '\t')).toEqual(candidate.rows);
      }
    } finally {
      await page.close();
    }
  });
}

test('popup: native selection, actual clipboard copy and local CSV download', async ({ extension }) => {
  const expected = JSON.parse(await readFile(resolve(workspace, 'tests/expected/01-native-table.json'), 'utf8')) as GoldenOutput;
  const { page, tabId } = await extension.openFixture('01-native-table.html');
  const popup = await extension.openPopup(tabId);
  try {
    await expect(popup.locator('#table-list input[type="radio"]')).toHaveCount(1);
    await expect(popup.locator('#selection-summary')).toContainText('3 行 × 3 列');
    await expect(popup.locator('#selection-state')).toHaveText('完整');
    await expect(popup.locator('#copy')).toBeEnabled();
    await expect(popup.locator('#export-csv')).toBeEnabled();
    await popup.bringToFront();
    // Automation reads the actual clipboard from the focused local test page;
    // the extension itself retains its minimal manifest and only writes on click.
    await extension.context.grantPermissions(['clipboard-read'], { origin: fixtureOrigin });
    await popup.locator('#copy').click();
    await expect(popup.locator('#action-status')).toContainText('已复制');
    await page.bringToFront();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(parseDelimited(clipboardText, '\t')).toEqual(expected.tables[0]?.rows);

    await popup.bringToFront();
    const downloaded = popup.waitForEvent('download');
    await popup.locator('#export-csv').click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe('tableflow-1.csv');
    const path = await download.path();
    if (!path) throw new Error('Local CSV download did not produce a readable file.');
    const bytes = await readFile(path);
    expect([...bytes.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
    expect(parseDelimited(bytes.toString('utf8'), ',')).toEqual(expected.tables[0]?.rows);
  } finally {
    await popup.close();
    await page.close();
  }
});

test('popup: ARIA missing-row diagnostics require confirmation before exporting the exact current matrix', async ({ extension }) => {
  const expected = JSON.parse(await readFile(resolve(workspace, 'tests/expected/04-aria-grid.json'), 'utf8')) as GoldenOutput;
  const { page, tabId } = await extension.openFixture('04-aria-grid.html');
  await page.locator('[role="grid"][aria-label="人员"]').evaluate((element) => element.setAttribute('aria-rowcount', '5'));
  const popup = await extension.openPopup(tabId);
  try {
    await expect(popup.locator('#table-list input[type="radio"]')).toHaveCount(3);
    await expect(popup.locator('#table-warnings')).toContainText('不完整');
    await expect(popup.locator('#selection-state')).toHaveText('可能不完整');
    await expect(popup.locator('#copy')).toBeEnabled();
    await expect(popup.locator('#export-csv')).toBeEnabled();
    const downloads: string[] = [];
    popup.on('download', (download) => downloads.push(download.suggestedFilename()));
    await popup.locator('#export-csv').click();
    await expect(popup.locator('#export-confirm')).toBeVisible();
    expect(downloads).toEqual([]);
    await popup.locator('#cancel-export').click();
    expect(downloads).toEqual([]);
    await popup.locator('#export-csv').click();
    const downloaded = popup.waitForEvent('download');
    await popup.locator('#confirm-export').click();
    const download = await downloaded;
    const path = await download.path();
    if (!path) throw new Error('Confirmed current-data CSV was not created.');
    const bytes = await readFile(path);
    expect([...bytes.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
    expect(parseDelimited(bytes.toString('utf8'), ',')).toEqual(expected.tables[0]?.rows);
    await popup.locator('#table-list input[type="radio"]').nth(1).check();
    await expect(popup.locator('#matrix-preview td')).toHaveText(['字段', '值', '来源', 'ARIA table']);
    await expect(popup.locator('#copy')).toBeEnabled();
    await expect(popup.locator('#export-csv')).toBeEnabled();
  } finally {
    await popup.close();
    await page.close();
  }
});

test('popup: visible virtual data requires confirmation and collection produces the full explicit-copy scope', async ({ extension }) => {
  const { page, tabId } = await extension.openFixture('12-virtual-scroll.html');
  const popup = await extension.openPopup(tabId);
  try {
    await expect(popup.locator('#table-list input[type="radio"]')).toHaveCount(1);
    await expect(popup.locator('#copy')).toBeEnabled();
    await expect(popup.locator('#export-csv')).toBeEnabled();
    await popup.locator('#copy').click();
    await expect(popup.locator('#export-confirm')).toBeVisible();
    await popup.locator('#cancel-export').click();
    await expect(popup.locator('#selection-state')).toHaveAttribute('data-completeness', 'visible-only');
    await expect(popup.locator('#table-warnings')).toContainText('已渲染的 20 行');
    await expect(popup.locator('#table-warnings')).toContainText('页面声明约 120 行');
    await expect(popup.locator('#collect')).toBeVisible();
    await popup.locator('#collect').click();
    await expect(popup.locator('#action-status')).toContainText('已收集数据，未检测到缺失', { timeout: 30_000 });
    await expect(popup.locator('#selection-summary')).toContainText('120 行 × 3 列');
    await expect(popup.locator('#selection-state')).toHaveText('完整');
    await expect(popup.locator('#copy')).toBeEnabled();
    await expect(popup.locator('#export-csv')).toBeEnabled();
    await expect(popup.locator('#collect')).toBeHidden();
    expect(await page.locator('.virtual-viewport').evaluate((element) => element.scrollTop)).toBe(0);
  } finally {
    await popup.close();
    await page.close();
  }
});

test('popup: inaccessible frame diagnosis is displayed', async ({ extension }) => {
  const { page, tabId } = await extension.openFixture('11-same-origin-iframe.html');
  const snapshot = await extension.inspect(tabId);
  const diagnostic = snapshot.diagnostics.find((entry) => entry.code === 'CROSS_ORIGIN_FRAME_PERMISSION');
  expect(diagnostic).toBeDefined();
  const popup = await extension.openPopup(tabId);
  try {
    await popup.locator('#scan-details summary').click();
    await expect(popup.locator('#scan-diagnostics')).toBeVisible();
    await expect(popup.locator('#scan-diagnostics')).toContainText(diagnostic!.message);
  } finally {
    await popup.close();
    await page.close();
  }
});

test('popup: site toggle adds icons and actual storage removal clears icons, switch and registration', async ({ extension }) => {
  const { page, tabId } = await extension.openFixture('01-native-table.html');
  const popup = await extension.openPopup(tabId);
  try {
    const toggle = popup.locator('#site-icons');
    await expect(toggle).toBeEnabled();
    await toggle.check();
    await expect(popup.locator('#site-hint')).toContainText('已开启');
    await expect(page.locator('[data-tableflow-overlay] button')).toHaveCount(1);
    // The test manifest's localhost grant is mandatory and Chrome cannot revoke
    // it. Exercise real settings/background/overlay events instead of pretending
    // this setup can verify the production optional-permission removal dialog.
    await extension.worker.evaluate(async () => { await chrome.storage.local.set({ autoIconSites: [] }); });
    await expect(page.locator('[data-tableflow-overlay]')).toHaveCount(0);
    await expect.poll(() => extension.worker.evaluate(async () => chrome.scripting.getRegisteredContentScripts({ ids: ['tableflow-auto-icons'] }))).toEqual([]);
    await popup.locator('#rescan').click();
    await expect(toggle).not.toBeChecked();
    const settings = await extension.worker.evaluate(async () => chrome.storage.local.get('autoIconSites'));
    expect(settings.autoIconSites).toEqual([]);
  } finally {
    await popup.close();
    await page.close();
  }
});
