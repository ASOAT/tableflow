import { AUTO_ICON_SITES_KEY, readEnabledSites } from '../shared/site-settings';
import { PopupError } from './scan-page';

export async function isSiteEnabled(pattern: string): Promise<boolean> {
  const settings = await chrome.storage.local.get(AUTO_ICON_SITES_KEY);
  return readEnabledSites(settings[AUTO_ICON_SITES_KEY]).includes(pattern)
    && await chrome.permissions.contains({ origins: [pattern] });
}

/** Permission request is started synchronously by the Popup's click handler. */
export async function saveSiteIcons(pattern: string, enabled: boolean, grant?: Promise<boolean>): Promise<void> {
  if (enabled && !await grant) throw new PopupError('PERMISSION_DENIED');
  const settings = await chrome.storage.local.get(AUTO_ICON_SITES_KEY);
  const previous = readEnabledSites(settings[AUTO_ICON_SITES_KEY]);
  const sites = enabled ? [...new Set([...previous, pattern])].sort() : previous.filter((site) => site !== pattern);
  await chrome.storage.local.set({ [AUTO_ICON_SITES_KEY]: sites });
  try {
    const response: { ok?: boolean } | undefined = await chrome.runtime.sendMessage({ type: 'tableflow:sync-icons' });
    if (!response?.ok) throw new PopupError('SYNC_FAILED');
  } catch (error) {
    await chrome.storage.local.set({ [AUTO_ICON_SITES_KEY]: previous });
    if (enabled && !previous.includes(pattern)) await chrome.permissions.remove({ origins: [pattern] });
    throw error;
  }
  if (!enabled) await chrome.permissions.remove({ origins: [pattern] });
}
