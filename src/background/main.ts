import { AUTO_ICON_SITES_KEY, readEnabledSites } from '../shared/site-settings';

const SCRIPT_ID = 'tableflow-auto-icons';
let pending: Promise<void> = Promise.resolve();

async function syncScripts(): Promise<void> {
  const settings = await chrome.storage.local.get(AUTO_ICON_SITES_KEY);
  const sites = readEnabledSites(settings[AUTO_ICON_SITES_KEY]);
  const enabled: string[] = [];
  for (const site of sites) {
    if (await chrome.permissions.contains({ origins: [site] })) enabled.push(site);
  }
  // Revoking a website grant also clears its saved switch and existing icons.
  if (enabled.length !== sites.length) {
    await chrome.storage.local.set({ [AUTO_ICON_SITES_KEY]: enabled });
  }

  const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (enabled.length === 0) {
    if (existing) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  const config: chrome.scripting.RegisteredContentScript = {
    id: SCRIPT_ID,
    matches: enabled,
    js: ['auto-icons.js'],
    allFrames: false,
    runAt: 'document_idle',
    persistAcrossSessions: true,
    world: 'ISOLATED',
  };
  if (existing) await chrome.scripting.updateContentScripts([config]);
  else await chrome.scripting.registerContentScripts([config]);
}

function synchronize(): Promise<void> {
  // Serialize storage and permission events so the latest saved switch wins.
  pending = pending.catch(() => undefined).then(syncScripts);
  return pending;
}

chrome.runtime.onInstalled.addListener(() => { void synchronize().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { void synchronize().catch(console.error); });
chrome.permissions.onRemoved.addListener(() => { void synchronize().catch(console.error); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[AUTO_ICON_SITES_KEY]) void synchronize().catch(console.error);
});
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const trustedPopupTab = sender.tab && sender.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL(chrome.runtime.getManifest().action?.default_popup ?? 'popup.html');
  if (sender.id !== chrome.runtime.id || (sender.tab && !trustedPopupTab) || !message || typeof message !== 'object'
      || !('type' in message) || message.type !== 'tableflow:sync-icons') return;
  void synchronize().then(
    () => sendResponse({ ok: true }),
    () => sendResponse({ ok: false }),
  );
  return true;
});
