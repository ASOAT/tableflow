import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_ICON_SITES_KEY } from '../src/shared/site-settings';

const firstSite = 'https://example.com/*';
const secondSite = 'https://second.example/*';
type Sender = { id?: string; url?: string; tab?: { id: number } };
type Response = { ok: boolean };
function event<T>() {
  const listeners: T[] = [];
  return { listeners, addListener: vi.fn((listener: T) => { listeners.push(listener); }) };
}

function createBrowserMock() {
  let sites: unknown = [];
  let existing: chrome.scripting.RegisteredContentScript[] = [];
  const grants = new Set<string>();
  const operations: string[] = [];
  const completions = new Map<string, () => void>();
  const record = (operation: string) => {
    operations.push(operation);
    completions.get(operation)?.();
    completions.delete(operation);
  };
  const installed = event<() => void>();
  const startup = event<() => void>();
  const removed = event<() => void>();
  const changed = event<(changes: { [key: string]: chrome.storage.StorageChange }, area: string) => void>();
  const message = event<(message: unknown, sender: Sender, respond: (response: Response) => void) => boolean | undefined>();
  const browser = {
    runtime: { id: 'tableflow-test', getURL: (path: string) => `chrome-extension://tableflow-test/${path}`,
      getManifest: () => ({ action: { default_popup: 'popup.html' } }),
      onInstalled: installed, onStartup: startup, onMessage: message },
    permissions: {
      onRemoved: removed,
      contains: vi.fn(async (request: { origins: string[] }) => request.origins.every((site) => grants.has(site))),
    },
    storage: {
      onChanged: changed,
      local: {
        get: vi.fn(async () => ({ [AUTO_ICON_SITES_KEY]: sites })),
        set: vi.fn(async (value: { [key: string]: unknown }) => {
          sites = value[AUTO_ICON_SITES_KEY];
          record('storage:set');
        }),
      },
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => { record('scripts:get'); return existing; }),
      registerContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
        existing = scripts; record('scripts:register');
      }),
      updateContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
        existing = scripts; record('scripts:update');
      }),
      unregisterContentScripts: vi.fn(async () => { existing = []; record('scripts:unregister'); }),
    },
  };
  return {
    browser, grants, operations,
    settings: (value: unknown) => { sites = value; },
    scripts: (value: chrome.scripting.RegisteredContentScript[]) => { existing = value; },
    savedSites: () => sites,
    installed, startup, removed, changed, message,
    nextOperation: (operation: string) => new Promise<void>((resolve) => completions.set(operation, resolve)),
    synchronize: () => new Promise<Response>((resolve) => {
      expect(message.listeners[0]!({ type: 'tableflow:sync-icons' }, { id: 'tableflow-test' }, resolve)).toBe(true);
    }),
  };
}

let mock: ReturnType<typeof createBrowserMock>;
beforeEach(async () => {
  vi.resetModules();
  mock = createBrowserMock();
  vi.stubGlobal('chrome', mock.browser);
  await import('../src/background/main');
});
afterEach(() => vi.unstubAllGlobals());

describe('automatic icon worker registrations', () => {
  it('registers only valid explicitly enabled and granted sites', async () => {
    mock.settings([secondSite, firstSite, firstSite, 'https://*/*', 'invalid']);
    mock.grants.add(firstSite).add(secondSite);
    await expect(mock.synchronize()).resolves.toEqual({ ok: true });
    expect(mock.browser.permissions.contains.mock.calls).toEqual([
      [{ origins: [firstSite] }], [{ origins: [secondSite] }],
    ]);
    expect(mock.browser.scripting.registerContentScripts).toHaveBeenCalledExactlyOnceWith([{
      id: 'tableflow-auto-icons',
      matches: [firstSite, secondSite],
      js: ['auto-icons.js'],
      allFrames: false,
      runAt: 'document_idle',
      persistAcrossSessions: true,
      world: 'ISOLATED',
    }]);
    expect(mock.browser.scripting.getRegisteredContentScripts)
      .toHaveBeenCalledWith({ ids: ['tableflow-auto-icons'] });
  });

  it('updates an existing registration instead of adding a duplicate', async () => {
    mock.settings([firstSite]);
    mock.grants.add(firstSite);
    mock.scripts([{ id: 'tableflow-auto-icons', matches: [secondSite], js: ['auto-icons.js'] }]);
    await mock.synchronize();
    expect(mock.browser.scripting.updateContentScripts).toHaveBeenCalledOnce();
    expect(mock.browser.scripting.updateContentScripts.mock.calls[0]?.[0][0]?.matches).toEqual([firstSite]);
    expect(mock.browser.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('unregisters when no websites are enabled and leaves no-registration state alone', async () => {
    mock.scripts([{ id: 'tableflow-auto-icons', js: ['auto-icons.js'], matches: [firstSite] }]);
    await mock.synchronize();
    expect(mock.browser.scripting.unregisterContentScripts)
      .toHaveBeenCalledExactlyOnceWith({ ids: ['tableflow-auto-icons'] });
    await mock.synchronize();
    expect(mock.browser.scripting.unregisterContentScripts).toHaveBeenCalledOnce();
    expect(mock.browser.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('clears a revoked grant from saved switches before updating registrations', async () => {
    mock.settings([firstSite, secondSite]);
    mock.grants.add(secondSite);
    mock.scripts([{ id: 'tableflow-auto-icons', js: ['auto-icons.js'], matches: [firstSite, secondSite] }]);
    const updated = mock.nextOperation('scripts:update');
    mock.removed.listeners[0]!();
    await updated;
    expect(mock.savedSites()).toEqual([secondSite]);
    expect(mock.operations).toEqual(['storage:set', 'scripts:get', 'scripts:update']);
    expect(mock.browser.storage.local.set).toHaveBeenCalledWith({ [AUTO_ICON_SITES_KEY]: [secondSite] });
    expect(mock.browser.scripting.updateContentScripts.mock.calls[0]?.[0][0]?.matches).toEqual([secondSite]);
  });

  it('clears the final revoked website before unregistering its script', async () => {
    mock.settings([firstSite]);
    mock.scripts([{ id: 'tableflow-auto-icons', js: ['auto-icons.js'], matches: [firstSite] }]);
    await mock.synchronize();
    expect(mock.savedSites()).toEqual([]);
    expect(mock.operations).toEqual(['storage:set', 'scripts:get', 'scripts:unregister']);
  });

  it('synchronizes installation, startup, and only the relevant local-storage event', async () => {
    mock.settings([firstSite]);
    mock.grants.add(firstSite);
    const registered = mock.nextOperation('scripts:register');
    mock.installed.listeners[0]!();
    await registered;
    const updated = mock.nextOperation('scripts:update');
    mock.startup.listeners[0]!();
    await updated;
    const readCount = mock.browser.storage.local.get.mock.calls.length;
    mock.changed.listeners[0]!({ unrelated: { newValue: true } }, 'local');
    mock.changed.listeners[0]!({ [AUTO_ICON_SITES_KEY]: { newValue: [] } }, 'sync');
    await Promise.resolve();
    expect(mock.browser.storage.local.get.mock.calls.length).toBe(readCount);
    mock.settings([]);
    const unregistered = mock.nextOperation('scripts:unregister');
    mock.changed.listeners[0]!({ [AUTO_ICON_SITES_KEY]: { newValue: [] } }, 'local');
    await unregistered;
    expect(mock.browser.scripting.unregisterContentScripts).toHaveBeenCalledOnce();
  });

  it('rejects content-script and unrelated message senders without touching registrations', () => {
    const respond = vi.fn();
    const listener = mock.message.listeners[0]!;
    for (const [message, sender] of [
      [{ type: 'tableflow:sync-icons' }, { id: 'other-extension' }],
      [{ type: 'tableflow:sync-icons' }, { id: 'tableflow-test', tab: { id: 1 } }],
      [{ type: 'tableflow:sync-icons' }, { id: 'tableflow-test', tab: { id: 1 }, url: 'https://example.com/' }],
      [{ type: 'other-message' }, { id: 'tableflow-test' }],
      [null, { id: 'tableflow-test' }],
    ] as Array<[unknown, Sender]>) {
      expect(listener(message, sender, respond)).toBeUndefined();
    }
    expect(respond).not.toHaveBeenCalled();
    expect(mock.browser.storage.local.get).not.toHaveBeenCalled();
  });
  it('accepts the exact internal popup page when opened in an extension tab', async () => {
    const response = await new Promise<Response>((resolve) => {
      expect(mock.message.listeners[0]!({ type: 'tableflow:sync-icons' }, {
        id: 'tableflow-test', tab: { id: 1 }, url: 'chrome-extension://tableflow-test/popup.html?debug=1',
      }, resolve)).toBe(true);
    });
    expect(response).toEqual({ ok: true });
  });

  it('answers approved messages with errors and recovers for the next synchronization', async () => {
    mock.settings([firstSite]);
    mock.grants.add(firstSite);
    mock.browser.scripting.registerContentScripts.mockRejectedValueOnce(new Error('Registration failed'));
    await expect(mock.synchronize()).resolves.toEqual({ ok: false });
    await expect(mock.synchronize()).resolves.toEqual({ ok: true });
    expect(mock.browser.scripting.registerContentScripts).toHaveBeenCalledTimes(2);
  });
});
