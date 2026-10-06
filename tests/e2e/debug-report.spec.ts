import { readFile } from 'node:fs/promises';
import { test, expect } from './extensionFixtures';
const extensionVersion = JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8')).version as string;

test('explicit Help report contains structural facts without business content, tokens or storage', async ({ extension }) => {
  const { page, tabId } = await extension.openComponent('antd', 'A1');
  await page.evaluate(() => {
    history.replaceState({}, '', '?token=PRIVATE_TOKEN#PRIVATE_FRAGMENT');
    localStorage.setItem('token', 'PRIVATE_STORAGE');
    document.cookie = 'secret=PRIVATE_COOKIE';
    document.querySelector('.ant-table-tbody td')!.textContent = 'PRIVATE_BUSINESS_VALUE';
    const input = document.createElement('input'); input.value = 'PRIVATE_FORM_VALUE'; document.body.append(input);
  });
  const popup = await extension.openPopup(tabId);
  try {
    await expect(popup.locator('#debug-report')).toBeHidden();
    await popup.locator('#help').click();
    await expect(popup.locator('#help-dialog')).toBeVisible();
    await expect(popup.locator('#debug-report')).toBeVisible();
    await expect(popup.locator('#table-list input')).toHaveCount(1);
    const pending = popup.waitForEvent('download');
    await popup.locator('#debug-report').click();
    const downloaded = await pending;
    const path = await downloaded.path();
    if (!path) throw new Error('Debug JSON did not create a local download.');
    const text = await readFile(path, 'utf8');
    const report = JSON.parse(text) as { version: string; origin: string; extractor: string; structure: { rows: number } };
    expect(report.version).toBe(extensionVersion); expect(report.origin).toBe('http://localhost:4175');
    expect(report.extractor).toBe('ant-design'); expect(report.structure.rows).toBeGreaterThan(0);
    for (const secret of ['PRIVATE_TOKEN', 'PRIVATE_FRAGMENT', 'PRIVATE_STORAGE', 'PRIVATE_COOKIE', 'PRIVATE_BUSINESS_VALUE', 'PRIVATE_FORM_VALUE', 'Authorization', 'localStorage', '<table']) {
      expect(text).not.toContain(secret);
    }
  } finally { await popup.close(); await page.close(); }
});
