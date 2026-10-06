import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { ExtractionDiagnostics } from '../../src/shared/diagnostics';

export const workspace = resolve('.');
export const artifacts = resolve(workspace, '.test-artifacts');
export const fixtureOrigin = 'http://localhost:4173';
export const componentOrigin = 'http://localhost:4175';

export interface CandidateView {
  id: string;
  snapshotId?: string;
  type: string;
  confidence: number;
  title?: string;
  rows: string[][];
  columns: number;
  diagnostics: ExtractionDiagnostics;
  metadata: {
    headerRows: number;
    complete: boolean;
    virtualized?: boolean;
    expectedRowCount?: number;
    expectedColumnCount?: number;
    [key: string]: unknown;
  };
}

export interface DiagnosticView {
  code: string;
  message: string;
  certainty?: string;
}

export interface EngineSnapshot {
  tables: CandidateView[];
  diagnostics: DiagnosticView[];
}

export interface BenchmarkResult {
  detectMs: number;
  extractMs: number;
  csvMs: number;
  tsvMs: number;
  rows: number;
  columns: number;
  diagnosticsMs?: number;
}

interface BrowserScanner {
  inspectTables(): EngineSnapshot;
  collectTable(id: string, limits?: { maxRows?: number; maxIterations?: number; timeoutMs?: number }): Promise<CandidateView>;
  serializeRows(rows: string[][], format: 'csv' | 'tsv'): string;
  benchmarkTables(): BenchmarkResult;
}
interface DeveloperTools {
  serializeRows(rows: string[][], format: 'csv' | 'tsv'): string;
  benchmarkTables(): BenchmarkResult;
}

export interface LoadedExtension {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  unexpectedRequests: string[];
  close(): Promise<void>;
}

const observedRequests: string[] = [];
const unexpectedRequests: string[] = [];

function allowedRequest(raw: string): boolean {
  const url = new URL(raw.startsWith('blob:') ? raw.slice(5) : raw);
  return url.protocol === 'chrome-extension:'
    || (url.protocol === 'http:' && url.hostname === 'localhost' && ['4173', '4174', '4175'].includes(url.port))
    || (url.protocol === 'ws:' && url.hostname === 'localhost' && url.port === '4175');
}

export interface FixturePage {
  page: Page;
  tabId: number;
}

export interface ExtensionHarness extends LoadedExtension {
  openFixture(file: string): Promise<FixturePage>;
  openComponent(family: string, scenario: string): Promise<FixturePage>;
  openPopup(tabId: number): Promise<Page>;
  inspect(tabId: number): Promise<EngineSnapshot>;
  collect(tabId: number, id: string, limits?: { maxRows?: number; maxIterations?: number; timeoutMs?: number }): Promise<CandidateView>;
  serialize(tabId: number, rows: string[][], format: 'csv' | 'tsv'): Promise<string>;
  benchmark(tabId: number): Promise<BenchmarkResult>;
}

/** Never delete a browser profile or test checkout outside the task's artifacts. */
async function removeArtifact(path: string): Promise<void> {
  const absolute = resolve(path);
  if (absolute === artifacts || !absolute.startsWith(artifacts + sep)) {
    throw new Error(`Refusing cleanup outside .test-artifacts: ${absolute}`);
  }
  await rm(absolute, { recursive: true, force: true });
}

export async function launchExtension(directory: string): Promise<LoadedExtension> {
  const profiles = resolve(artifacts, 'profiles');
  await mkdir(profiles, { recursive: true });
  const profile = await mkdtemp(resolve(profiles, 'chromium-'));
  let context: BrowserContext | undefined;
  try {
    // Chromium's new headless channel supports real MV3 extension loading.
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      acceptDownloads: true,
      args: [
        `--disable-extensions-except=${resolve(directory)}`,
        `--load-extension=${resolve(directory)}`,
      ],
    });
    const outsideRequests: string[] = [];
    context.on('request', (request) => {
      const url = request.url();
      observedRequests.push(url);
      if (!allowedRequest(url)) {
        outsideRequests.push(url);
        unexpectedRequests.push(url);
      }
    });
    const worker = context.serviceWorkers()[0]
      ?? await context.waitForEvent('serviceworker', { timeout: 20_000 });
    const extensionId = new URL(worker.url()).hostname;
    if (!extensionId) throw new Error('The extension background worker has no extension id.');
    const loadedContext = context;
    return {
      context: loadedContext,
      worker,
      extensionId,
      unexpectedRequests: outsideRequests,
      async close() {
        try {
          await loadedContext.close();
        } finally {
          await removeArtifact(profile);
          await writeFile(resolve(artifacts, 'network-requests.json'), `${JSON.stringify({ requests: observedRequests, unexpectedRequests }, null, 2)}\n`, 'utf8');
          await writeFile(resolve(artifacts, 'network-results.json'), `${JSON.stringify({ observedRequests: observedRequests.length, externalRequests: unexpectedRequests.length, urls: observedRequests }, null, 2)}\n`, 'utf8');
        }
      },
    };
  } catch (error) {
    await context?.close();
    await removeArtifact(profile);
    throw error;
  }
}

async function createFixtureHarness(): Promise<ExtensionHarness> {
  const directory = resolve(artifacts, 'e2e-extension');
  await removeArtifact(directory);
  await cp(resolve(workspace, 'dist'), directory, { recursive: true });
  const manifestPath = resolve(directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  // This local, test-only host grant avoids automating a native permission dialog.
  // All extension JavaScript bytes match dist. The production manifest is untouched.
  // A separate smoke test loads the original dist without this grant.
  manifest.host_permissions = ['http://localhost/*'];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const loaded = await launchExtension(directory);
  await loaded.worker.evaluate(async () => { await chrome.storage.local.set({onboardingSeen:true,uiLanguage:'zh-CN'}); });
  const toolsName = 'dev-tools.js';
  // Explicit test tool entry is separate from production code and never packaged.
  await cp(resolve(artifacts, 'development', toolsName), resolve(directory, toolsName));

  return {
    ...loaded,
    async openFixture(file) {
      const page = await loaded.context.newPage();
      try {
        await page.goto(`${fixtureOrigin}/tests/fixtures/${file}`, { waitUntil: 'load' });
        const tabId = await loaded.worker.evaluate(async (url) => {
          const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
          if (tab?.id === undefined) throw new Error(`Fixture tab is unavailable: ${url}`);
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
          return tab.id;
        }, page.url());
        return { page, tabId };
      } catch (error) {
        await page.close();
        throw error;
      }
    },
    async openComponent(family, scenario) {
      const page = await loaded.context.newPage();
      try {
        await page.goto(`${componentOrigin}/?family=${encodeURIComponent(family)}&case=${encodeURIComponent(scenario)}`, { waitUntil: 'load' });
        await page.locator('body[data-lab-ready="true"]').waitFor();
        const tabId = await loaded.worker.evaluate(async (url) => {
          const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
          if (tab?.id === undefined) throw new Error(`Component tab is unavailable: ${url}`);
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
          return tab.id;
        }, page.url());
        return { page, tabId };
      } catch (error) {
        await page.close();
        throw error;
      }
    },
    async openPopup(tabId) {
      // Chromium's headless toolbar popup is an "other" CDP target, not a Page.
      // Load the identical extension page in a background tab and keep the real
      // fixture active for the unmodified popup's chrome.tabs/scripting calls.
      const popup = await loaded.context.newPage();
      await loaded.worker.evaluate(async (id) => { await chrome.tabs.update(id, { active: true }); }, tabId);
      const popupPath = await loaded.worker.evaluate(() => chrome.runtime.getManifest().action?.default_popup);
      if (!popupPath) throw new Error('Manifest has no popup entry.');
      await popup.goto(`chrome-extension://${loaded.extensionId}/${popupPath}`, { waitUntil: 'load' });
      return popup;
    },
    async inspect(tabId) {
      return loaded.worker.evaluate(async (id) => {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: id },
          func: () => {
            const scanner = (globalThis as typeof globalThis & { TableFlowScanner: BrowserScanner }).TableFlowScanner;
            return scanner.inspectTables();
          },
        });
        if (!result?.result) throw new Error('inspectTables did not return an engine snapshot.');
        return result.result;
      }, tabId);
    },
    async collect(tabId, id, limits) {
      return loaded.worker.evaluate(async ({ targetTab, candidateId, bounds }) => {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: targetTab },
          func: (tableId: string, collectionLimits: { maxRows?: number; maxIterations?: number; timeoutMs?: number }) => {
            const scanner = (globalThis as typeof globalThis & { TableFlowScanner: BrowserScanner }).TableFlowScanner;
            return scanner.collectTable(tableId, collectionLimits);
          },
          args: [candidateId, bounds],
        });
        if (!result?.result) throw new Error('collectTable did not return a candidate.');
        return result.result;
      }, { targetTab: tabId, candidateId: id, bounds: limits ?? {} });
    },
    async serialize(tabId, rows, format) {
      await loaded.worker.evaluate(async (id) => { await chrome.scripting.executeScript({ target:{tabId:id}, files:['dev-tools.js'] }); },tabId);
      return loaded.worker.evaluate(async ({ targetTab, matrix, kind }) => {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: targetTab },
          func: (values: string[][], delimiter: 'csv' | 'tsv') => {
            const scanner = (globalThis as typeof globalThis & { TableFlowDeveloperTools: DeveloperTools }).TableFlowDeveloperTools;
            return scanner.serializeRows(values, delimiter);
          },
          args: [matrix, kind],
        });
        if (typeof result?.result !== 'string') throw new Error('serializeRows did not return text.');
        return result.result;
      }, { targetTab: tabId, matrix: rows, kind: format });
    },
    async benchmark(tabId) {
      await loaded.worker.evaluate(async (id) => { await chrome.scripting.executeScript({ target:{tabId:id}, files:['dev-tools.js'] }); },tabId);
      return loaded.worker.evaluate(async (id) => {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: id },
          func: () => {
            const scanner = (globalThis as typeof globalThis & { TableFlowDeveloperTools: DeveloperTools }).TableFlowDeveloperTools;
            return scanner.benchmarkTables();
          },
        });
        if (!result?.result) throw new Error('benchmarkTables did not return measurements.');
        return result.result;
      }, tabId);
    },
  };
}

export const test = base.extend<object, { extension: ExtensionHarness }>({
  extension: [async ({ playwright }, use) => {
    // Consume the built-in fixture so Playwright owns browser runtime lifecycle.
    if (!playwright.chromium) throw new Error('Chromium is unavailable.');
    const extension = await createFixtureHarness();
    try {
      await use(extension);
    } finally {
      await extension.close();
      expect(extension.unexpectedRequests, 'Fixture interactions must not send external requests.').toEqual([]);
    }
  }, { scope: 'worker' }],
});

export { expect } from '@playwright/test';
