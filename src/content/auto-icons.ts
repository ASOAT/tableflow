import { setTableIcons } from './overlay';
import { AUTO_ICON_SITES_KEY, readEnabledSites, sitePattern } from '../shared/site-settings';

// This entry is registered only for websites explicitly granted by the user.
// Check the saved preference again so a stale registration cannot enable icons.
const pattern = sitePattern(document.URL);
if (pattern && typeof chrome !== 'undefined' && chrome.storage?.local) {
  void chrome.storage.local.get(AUTO_ICON_SITES_KEY).then((settings) => {
    if (readEnabledSites(settings[AUTO_ICON_SITES_KEY]).includes(pattern)) setTableIcons(true);
  }).catch(() => { /* Missing access or a removed preference leaves the page untouched. */ });
}
