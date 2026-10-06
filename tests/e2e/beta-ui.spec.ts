import { test, expect } from './extensionFixtures';
import { readFile } from 'node:fs/promises';
const extensionVersion = JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8')).version as string;

test('beta: first-use explanation persists locally and help stays available', async ({ extension }) => {
  const { page, tabId } = await extension.openFixture('01-native-table.html');
  await extension.worker.evaluate(async () => chrome.storage.local.remove('onboardingSeen'));
  let popup = await extension.openPopup(tabId);
  try {
    await expect(popup.locator('#onboarding-dialog')).toBeVisible();
    await expect(popup.locator('#start-using')).toBeFocused();
    await popup.locator('#start-using').press('Enter');
    await expect(popup.locator('#onboarding-dialog')).toBeHidden();
    expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('onboardingSeen')).onboardingSeen)).toBe(true);
    await popup.close(); popup = await extension.openPopup(tabId);
    await expect(popup.locator('#table-list input')).toHaveCount(1);
    await expect(popup.locator('#onboarding-dialog')).toBeHidden();
    await popup.locator('#help').focus(); await popup.keyboard.press('Space');
    await expect(popup.locator('#help-dialog')).toBeVisible();
    await expect(popup.locator('#version')).toContainText(extensionVersion);
    await popup.keyboard.press('Escape');
    await expect(popup.locator('#help')).toBeFocused();
  } finally { await popup.close(); await page.close(); }
});

for (const change of ['DOM', 'SPA', 'refresh'] as const) {
  test(`beta: ${change} changes block exporting the old preview until rescan`, async ({ extension }) => {
    const { page, tabId } = await extension.openFixture('01-native-table.html');
    const popup = await extension.openPopup(tabId);
    try {
      await expect(popup.locator('#table-list input')).toHaveCount(1);
      const preview = await popup.locator('#matrix-preview').textContent();
      if (change === 'refresh') await page.reload();
      else await page.evaluate(kind => {
        if (kind === 'SPA') history.pushState(null, '', '?changed=1');
        else document.querySelector('tbody td')!.textContent = '已更新的业务值';
      }, change);
      let downloads = 0; popup.on('download', () => { downloads += 1; });
      await popup.locator('#export-csv').click();
      await expect(popup.locator('#action-status')).toContainText('网页已变化');
      await expect(popup.locator('#copy')).toBeDisabled();
      await expect(popup.locator('#export-csv')).toBeDisabled();
      expect(downloads).toBe(0);
      expect(await popup.locator('#matrix-preview').textContent()).toBe(preview);
      await popup.locator('#rescan').click();
      await expect(popup.locator('#copy')).toBeEnabled();
      if (change === 'DOM') await expect(popup.locator('#matrix-preview')).toContainText('已更新的业务值');
    } finally { await popup.close(); await page.close(); }
  });
}

test('beta: switching to another business tab cannot export the previous tab', async ({ extension }) => {
  const first = await extension.openFixture('01-native-table.html');
  const popup = await extension.openPopup(first.tabId);
  let second;
  try {
    await expect(popup.locator('#copy')).toBeEnabled();
    second = await extension.openFixture('02-rowspan-colspan.html');
    await extension.worker.evaluate(async id => chrome.tabs.update(id, { active: true }), second.tabId);
    await popup.locator('#copy').click();
    await expect(popup.locator('#action-status')).toContainText('网页已变化');
    await expect(popup.locator('#copy')).toBeDisabled();
  } finally { await popup.close(); await first.page.close(); await second?.page.close(); }
});

test('beta: reopening creates a new preview and invalidates the previous snapshot token', async ({ extension }) => {
  const { page, tabId } = await extension.openFixture('01-native-table.html');
  const previous = (await extension.inspect(tabId)).tables[0]!;
  const popup = await extension.openPopup(tabId);
  try {
    await expect(popup.locator('#copy')).toBeEnabled();
    const validation = await extension.worker.evaluate(async ({ id, token, tableId }) => {
      const [result] = await chrome.scripting.executeScript({ target: { tabId: id }, args: [token, tableId],
        func: (snapshotId: string, candidateId: string) => (globalThis as typeof globalThis & {
          TableFlowScanner: { validateSnapshot(token: string, id: string): { valid: boolean } }
        }).TableFlowScanner.validateSnapshot(snapshotId, candidateId) });
      return result?.result;
    }, { id: tabId, token: previous.snapshotId!, tableId: previous.id });
    expect(validation?.valid).toBe(false);
  } finally { await popup.close(); await page.close(); }
});

test('beta: risk confirmation traps keyboard focus and Escape restores the copy button', async ({ extension }) => {
  const { page, tabId } = await extension.openFixture('12-virtual-scroll.html');
  const popup = await extension.openPopup(tabId);
  try {
    await expect(popup.locator('#copy')).toBeEnabled();
    await popup.locator('#copy').focus(); await popup.keyboard.press('Enter');
    await expect(popup.locator('#export-confirm')).toBeVisible();
    await expect(popup.locator('#confirm-export')).toBeFocused();
    await popup.keyboard.press('Shift+Tab'); await expect(popup.locator('#cancel-export')).toBeFocused();
    await popup.keyboard.press('Tab'); await expect(popup.locator('#confirm-export')).toBeFocused();
    const outline = await popup.locator('#confirm-export').evaluate(element => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
    await expect(popup.locator('#export-confirm-notice')).toContainText('20 行');
    await expect(popup.locator('#export-confirm-notice')).toContainText('120 行');
    await popup.keyboard.press('Escape');
    await expect(popup.locator('#export-confirm')).toBeHidden();
    await expect(popup.locator('#copy')).toBeFocused();
  } finally { await popup.close(); await page.close(); }
});

for (const language of ['zh-CN', 'en']) for (const zoom of [1, 1.25, 1.5]) {
  test(`beta: narrow layout, long title, 24 columns and 10000-row label (${language}, ${zoom})`, async ({ extension }) => {
    const { page, tabId } = await extension.openFixture('01-native-table.html');
    await page.evaluate(() => {
      const table = document.querySelector('table')!;
      table.setAttribute('aria-rowcount', '10001');
      table.innerHTML = `<caption>${'很长的中文业务表格名称LongBusinessTable'.repeat(8)}</caption><thead><tr>${Array.from({ length: 24 }, (_, i) => `<th>列 ${i}</th>`).join('')}</tr></thead><tbody><tr>${'<td>中文 Long value</td>'.repeat(24)}</tr></tbody>`;
    });
    await extension.worker.evaluate(async uiLanguage => chrome.storage.local.set({ uiLanguage }), language);
    const popup = await extension.openPopup(tabId);
    try {
      // Approximate the reduced CSS viewport under system scaling. Applying
      // CSS zoom only to body is not OS scaling and creates artificial overflow.
      const width = Math.floor(360 / zoom);
      await popup.setViewportSize({ width, height: Math.floor(800 / zoom) });
      const cdp = await extension.context.newCDPSession(popup);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: Math.floor(800 / zoom), deviceScaleFactor: zoom, mobile: false });
      await expect(popup.locator('#copy')).toBeEnabled();
      await expect(popup.locator('#table-list')).toContainText('24');
      await expect(popup.locator('#table-warnings')).toContainText('10,000');
      expect(await popup.locator('#matrix-preview tbody tr').count()).toBeLessThanOrEqual(5);
      expect(await popup.locator('#matrix-preview tr').first().locator('th,td').count()).toBeLessThanOrEqual(8);
      const layout = await popup.evaluate(() => ({ pageWidth: document.documentElement.clientWidth,
        contentWidth: document.documentElement.scrollWidth, preview: document.querySelector('#matrix-preview')!.clientWidth }));
      expect(layout.contentWidth).toBeLessThanOrEqual(layout.pageWidth + 1);
      expect(layout.preview).toBeGreaterThan(0);
      await popup.locator('#copy').scrollIntoViewIfNeeded();
      const button = await popup.locator('#copy').boundingBox();
      expect(button).not.toBeNull(); expect(button!.x).toBeGreaterThanOrEqual(0);
      expect(button!.x + button!.width).toBeLessThanOrEqual(width + 1);
      await popup.locator('#help').click(); await popup.locator('#language').selectOption(language === 'en' ? 'zh-CN' : 'en');
      await popup.locator('#close-help').click(); await expect(popup.locator('#copy')).toBeEnabled();
    } finally { await popup.close(); await page.close(); await extension.worker.evaluate(async () => chrome.storage.local.set({ uiLanguage: 'zh-CN' })); }
  });
}
