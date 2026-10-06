import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getLanguage, localize, localizedWarning, number, setLanguage, t } from '../src/shared/i18n';

describe('official popup languages', () => {
  it.each(['zh-CN', 'en'] as const)('resolves every static UI label in %s without exposing translation keys', (language) => {
    const html = readFileSync('src/popup/index.html', 'utf8');
    document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1]!;
    setLanguage(language); localize();
    expect(document.documentElement.lang).toBe(language);
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
      expect(el.textContent?.trim()).toBeTruthy(); expect(el.textContent).not.toMatch(/undefined|\{\w+\}/);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) expect(el.getAttribute('aria-label')).toBeTruthy();
    expect(document.querySelector('#copy')!.textContent).toBe(language === 'en' ? 'Copy to Excel' : '复制到 Excel');
  });
  it('selects only a supported language and formats business counts', () => {
    setLanguage('en-US'); expect(getLanguage()).toBe('en'); expect(number(12345)).toBe('12,345');
    expect(t('dimensions', { rows: 3, columns: 4 })).toBe('3 rows × 4 columns');
    setLanguage('zh-TW'); expect(getLanguage()).toBe('zh-CN');
    expect(localizedWarning({ code: 'ROW_COUNT_MISMATCH', metadata: { extracted: 20, expected: 120 } })).toContain('20 行，页面声明约 120 行');
  });
  it.each(['en', 'zh_CN'])('provides Chromium manifest localization keys for %s', (locale) => {
    const messages = JSON.parse(readFileSync(`public/_locales/${locale}/messages.json`, 'utf8')) as Record<string, { message: string }>;
    for (const key of ['extensionName', 'extensionDescription', 'actionTitle']) expect(messages[key]?.message).toBeTruthy();
    expect(messages.extensionName!.message).toContain('TableFlow');
  });
});
