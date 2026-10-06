export const AUTO_ICON_SITES_KEY = 'autoIconSites';

/** Chrome host match patterns grant a scheme + hostname, across all ports. */
export function sitePattern(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return null;
  }
}

export function readEnabledSites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => {
    if (typeof item !== 'string') return false;
    return sitePattern(item) === item && !item.includes('*://') && !item.includes('//*');
  }))].sort();
}
