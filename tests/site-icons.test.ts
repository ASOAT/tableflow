import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSiteEnabled, saveSiteIcons } from '../src/popup/site-icons';
import { readEnabledSites, sitePattern } from '../src/shared/site-settings';

afterEach(() => vi.unstubAllGlobals());

function browserSettings(initial: string[] = [], registered = true) {
  let sites = initial;
  const set = vi.fn(async (value: { autoIconSites: string[] }) => { sites = value.autoIconSites; });
  const remove = vi.fn(async () => true);
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => ({ autoIconSites: sites }), set } },
    runtime: { sendMessage: async () => ({ ok: registered }) },
    permissions: { contains: async () => true, remove },
  });
  return { set, remove, sites: () => sites };
}

describe('per-site automatic icons', () => {
  it('only creates exact HTTP/HTTPS host patterns and validates saved settings', () => {
    expect(sitePattern('https://example.com:8443/path?a=secret')).toBe('https://example.com/*');
    expect(sitePattern('edge://extensions')).toBe(null);
    expect(sitePattern('file:///test.html')).toBe(null);
    expect(readEnabledSites(['https://example.com/*', 'https://example.com/*', 'https://*/*', 1, '<all_urls>']))
      .toEqual(['https://example.com/*']);
  });

  it('saves only a granted website while preserving another website switch', async () => {
    const browser = browserSettings(['https://other.com/*']);
    await saveSiteIcons('https://example.com/*', true, Promise.resolve(true));
    expect(browser.sites()).toEqual(['https://example.com/*', 'https://other.com/*']);
    await expect(isSiteEnabled('https://example.com/*')).resolves.toBe(true);
  });

  it('does not save a preference when the permission prompt is denied', async () => {
    const browser = browserSettings();
    await expect(saveSiteIcons('https://example.com/*', true, Promise.resolve(false))).rejects.toThrow('未获得');
    expect(browser.set).not.toHaveBeenCalled();
  });

  it('removes both the saved switch and optional grant when disabled', async () => {
    const browser = browserSettings(['https://example.com/*', 'https://other.com/*']);
    await saveSiteIcons('https://example.com/*', false);
    expect(browser.sites()).toEqual(['https://other.com/*']);
    expect(browser.remove).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
  });

  it('rolls back a failed registration instead of falsely showing the switch as enabled', async () => {
    const browser = browserSettings([], false);
    await expect(saveSiteIcons('https://example.com/*', true, Promise.resolve(true))).rejects.toThrow('无法保存');
    expect(browser.sites()).toEqual([]);
    expect(browser.remove).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
  });
});
