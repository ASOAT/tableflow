/* global chrome, navigator, document */
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDelimited } from '../../tests/e2e/parseDelimited.ts';
import { checkScreenshots } from '../../scripts/check-screenshots.mjs';

const artifacts = resolve('.test-artifacts');
const staging = resolve(artifacts, 'store-compositions');
const formal = resolve('store-assets/screenshots');
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const product = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.version, product.version, 'Build the current extension before taking screenshots');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(artifacts, 'browsers');
const { chromium, expect } = await import('@playwright/test');
await mkdir(staging, { recursive: true });
const logo = `data:image/png;base64,${(await readFile('store-assets/logo-300.png')).toString('base64')}`;

const copy = {
  'zh-CN': {
    tag: '网页表格导出助手', screen: '实际扩展界面', demo: '合成订单演示 · 非真实用户数据',
    footer: '主动读取当前网页 · 浏览器本地处理 · 无需账号',
    scenes: [
      ['01-detect.png', '自动发现\n网页数据表格', '点击 TableFlow，查看当前网页中可读取的表格。\n选择数据前，先核对行列数与范围。'],
      ['02-preview.png', '先预览，\n再导出', '核对当前数据快照中的表头和内容。\n选择复制到 Excel，或生成 CSV 文件。'],
      ['03-excel.png', '复制后，\n粘贴到 Excel', '实际复制成功反馈来自扩展。\n在 Excel 中粘贴；真人验收仍待完成。'],
      ['04-integrity.png', '看清数据范围，\n再确认导出', '页面声明的总数不等于当前可读取的行数。\n有完整性风险时，先确认当前范围。'],
      ['05-privacy.png', '网页数据，\n留在本地浏览器', '使用时读取完成导出所需的网页表格内容。\n无 TableFlow 业务服务器，不上传给 AI。'],
    ],
  },
  en: {
    tag: 'Web tables, ready to export', screen: 'Actual extension interface', demo: 'Synthetic order demo · No real user data',
    footer: 'User-initiated page access · Local processing · No account',
    scenes: [
      ['01-detect.png', 'Find tables\non the current page', 'Click TableFlow to discover readable web tables.\nCheck row counts, columns, and available scope.'],
      ['02-preview.png', 'Preview first.\nThen export.', 'Check the headers and the captured data.\nCopy to Excel or create a CSV file.'],
      ['03-excel.png', 'Copy, then\npaste into Excel.', 'The extension shows an actual copy confirmation.\nA real Excel paste still requires manual testing.'],
      ['04-integrity.png', 'Know the scope\nbefore exporting.', 'Declared totals can differ from readable rows.\nReview the warning and confirm the available scope.'],
      ['05-privacy.png', 'Your web data\nstays in your browser.', 'TableFlow reads only what is needed for table export.\nNo TableFlow business server or uploads to AI.'],
    ],
  },
};
function escape(text) { return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
async function removeSafe(path) {
  const absolute = resolve(path);
  assert.ok(absolute.startsWith(staging + sep), 'Cleanup must stay inside screenshot staging');
  await rm(absolute, { recursive: true, force: true });
}
const evidence = [];
for (const language of ['zh-CN', 'en']) {
  const languageStage = resolve(staging, language);
  await mkdir(languageStage, { recursive: true });
  const extension = await mkdtemp(resolve(staging, 'extension-'));
  const profile = await mkdtemp(resolve(staging, 'profile-'));
  await cp(resolve('dist'), extension, { recursive: true });
  // The production JS/CSS stays byte-for-byte unchanged. Only this temporary test manifest gains loopback access.
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify({ ...manifest, host_permissions: ['http://localhost/*'] }, null, 2));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, locale: language, viewport: { width: 840, height: 800 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    await worker.evaluate(async uiLanguage => chrome.storage.local.set({ onboardingSeen: true, uiLanguage, autoIconSites: [] }), language);
    await context.grantPermissions(['clipboard-read'], { origin: 'http://localhost:5173' });
    const page = await context.newPage();
    async function demo(name) {
      await page.goto(`http://localhost:5173/tests/store-demo/${name}`);
      await page.locator('body[data-demo-ready=true]').waitFor();
      return worker.evaluate(async url => {
        const tab = (await chrome.tabs.query({})).find(entry => entry.url === url);
        if (tab?.id === undefined) throw new Error('Synthetic demo tab unavailable');
        return tab.id;
      }, page.url());
    }
    async function popup(tabId, onboarding = false) {
      if (onboarding) await worker.evaluate(async () => chrome.storage.local.set({ onboardingSeen: false }));
      const current = await context.newPage();
      await current.setViewportSize({ width: 390, height: 580 });
      await worker.evaluate(async tab => chrome.tabs.update(tab, { active: true }), tabId);
      await current.goto(`chrome-extension://${id}/${manifest.action.default_popup}`);
      if (onboarding) await current.locator('#onboarding-dialog').waitFor({ state: 'visible' });
      else {
        await current.locator('#table-list input').first().waitFor();
        await expect(current.locator('#rescan')).toBeEnabled();
        await current.locator('#table-list input').first().check();
      }
      return current;
    }
    async function panelCapture(name) {
      const box = await page.locator('.panel').boundingBox();
      assert.ok(box && box.width <= 650);
      const rows = await page.locator('.virtual-row').count() ? page.locator('.virtual-row') : page.locator('tbody tr');
      const lastRow = await rows.nth(3).boundingBox();
      assert.ok(lastRow);
      const height = Math.round(lastRow.y + lastRow.height - box.y);
      const path = resolve(languageStage, name);
      await page.screenshot({ path, clip: { x: box.x, y: box.y, width: box.width, height } });
      return path;
    }
    const basicTab = await demo('index.html');
    const basicPanel = await panelCapture('basic-panel-original.png');
    const expected = await page.locator('table').evaluate(table => Array.from(table.rows, row => Array.from(row.cells, cell => cell.textContent.trim())));
    const ui = await popup(basicTab);
    const frames = [];
    async function capture(current, name) {
      const path = resolve(languageStage, name);
      await current.screenshot({ path });
      frames.push(path);
    }
    await ui.locator('#status').evaluate(status => status.scrollIntoView({ block: 'start' }));
    await capture(ui, '01-detect-original.png');
    await ui.locator('#selection').scrollIntoViewIfNeeded();
    await capture(ui, '02-preview-original.png');
    await ui.locator('#copy').click();
    await expect(ui.locator('#action-status')).toContainText(/已复制|Copied/);
    await page.bringToFront();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert.deepEqual(parseDelimited(clipboard, '\t'), expected, 'Actual copied matrix must match the synthetic page');
    await ui.bringToFront();
    await ui.locator('#action-status').scrollIntoViewIfNeeded();
    await capture(ui, '03-copy-original.png');
    await ui.close();
    const riskTab = await demo('virtual.html');
    const riskPanel = await panelCapture('risk-panel-original.png');
    const risk = await popup(riskTab);
    await risk.locator('#copy').click();
    await risk.locator('#export-confirm').waitFor({ state: 'visible' });
    await capture(risk, '04-integrity-original.png');
    await risk.locator('#cancel-export').click();
    await risk.close();
    const privacyTab = await demo('index.html');
    const privacy = await popup(privacyTab, true);
    await capture(privacy, '05-privacy-original.png');
    await privacy.close();
    const layout = await context.newPage();
    await layout.setViewportSize({ width: 1280, height: 800 });
    await mkdir(resolve(formal, language), { recursive: true });
    for (let index = 0; index < copy[language].scenes.length; index++) {
      const [filename, title, description] = copy[language].scenes[index];
      const photo = `data:image/png;base64,${(await readFile(frames[index])).toString('base64')}`;
      const tablePng = await readFile(index === 3 ? riskPanel : basicPanel);
      const tableHeight = tablePng.readUInt32BE(20);
      const table = `data:image/png;base64,${tablePng.toString('base64')}`;
      const words = copy[language];
      const html = `<!doctype html><html lang="${language}"><meta charset="utf-8"><title>TableFlow screenshot composition</title><style>
      *{box-sizing:border-box}html,body{margin:0;width:1280px;height:800px;overflow:hidden}body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;color:#173344;background:#edf6f6}body:before{content:"";position:absolute;right:-180px;top:-200px;width:700px;height:900px;background:#dceeed;border-radius:50%;transform:rotate(-18deg)}
      .brand{position:absolute;left:64px;top:34px;display:flex;align-items:center;gap:13px;font-size:24px;font-weight:700}.brand img{width:42px;height:42px}.tag{position:absolute;right:84px;top:47px;font-size:14px;color:#42666d;letter-spacing:.2px}
      .story{position:absolute;left:64px;top:126px;width:650px}.story h1{font-size:${language === 'en' ? '43' : '48'}px;letter-spacing:-1.5px;line-height:1.17;margin:0 0 24px;white-space:pre-line}.story p{font-size:18px;line-height:1.65;color:#486471;margin:0 0 32px;white-space:pre-line}.table-label{font-size:13px;font-weight:600;color:#486471;margin-bottom:11px}.table-photo{width:650px;height:${tableHeight}px;border-radius:13px;overflow:hidden;background:#fff;border:1px solid #d0e1e5;box-shadow:0 10px 30px #234d5f0a}.table-photo img{display:block;width:auto;height:${tableHeight}px;max-width:none}
      .product{position:absolute;right:84px;top:127px;width:390px}.product-label{text-align:center;font-size:13px;font-weight:600;color:#42666d;margin-bottom:12px}.product-photo{width:390px;height:580px;overflow:hidden;border-radius:13px;box-shadow:0 18px 45px #1b485829;border:1px solid #cadfe2;background:white}.product-photo img{display:block;width:390px;height:580px}.footer{position:absolute;left:64px;bottom:35px;font-size:14px;color:#466973}.footer:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#197e78;margin-right:10px}
      </style><div class="brand"><img src="${logo}" alt=""><span>TableFlow</span></div><div class="tag">${escape(words.tag)}</div><section class="story"><h1>${escape(title)}</h1><p>${escape(description)}</p><div class="table-label">${escape(words.demo)}</div><div class="table-photo"><img src="${table}" alt="Synthetic webpage screenshot"></div></section><section class="product"><div class="product-label">${escape(words.screen)}</div><div class="product-photo"><img src="${photo}" alt="Original extension screenshot"></div></section><div class="footer">${escape(words.footer)}</div></html>`;
      const source = resolve(languageStage, `${filename}.html`);
      await writeFile(source, html);
      await layout.goto(pathToFileURL(source).href);
      await layout.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode())); });
      await layout.screenshot({ path: resolve(formal, language, filename) });
    }
    evidence.push({ language, version: manifest.version, originalPopupSize: '390x580', finalSize: '1280x800', actualClipboardMatrixVerified: true, originalUiUnmodified: true, syntheticData: true, excelScreenCreated: false, visualReview: 'MANUAL REVIEW REQUIRED' });
  } finally {
    await context.close();
    await removeSafe(profile);
    await removeSafe(extension);
  }
}
await writeFile(resolve(staging, 'composition-info.json'), JSON.stringify({ generatedAt: new Date().toISOString(), evidence, manualResultChanged: false, screenshotReview: 'MANUAL REVIEW REQUIRED' }, null, 2));
const checked = await checkScreenshots(formal);
await writeFile(resolve(artifacts, 'screenshots-check.json'), JSON.stringify(checked, null, 2));
console.log('Ten technically valid screenshot candidates generated. MANUAL REVIEW REQUIRED; no Excel window or manual PASS was fabricated.');
