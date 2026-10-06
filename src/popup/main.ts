import './style.css';
import { EXTENSION_VERSION } from '../shared/version';
import { applyTableIconsToActivePage, cancelActiveCollection, collectActiveTable, generateActiveDebugReport, getActivePage, getActiveCollectionProgress, inspectActivePage, validateActiveSnapshot, popupErrorText } from './scan-page';
import { isSiteEnabled, saveSiteIcons } from './site-icons';
import { sitePattern } from '../shared/site-settings';
import { copyMatrix } from '../exporters/clipboard';
import { toCsv } from '../exporters/delimited';
import type { DiagnosticView, TableCandidateView } from '../shared/engine';
import type { ExtractorType } from '../extractors/types';
import { getLanguage, LANGUAGE_KEY, localize, localizedWarning, number, setLanguage, t } from '../shared/i18n';
import { completenessLabel, completenessNotice, exportBlocked, exportNeedsConfirmation, tableDiagnostics } from './diagnostics';

const element = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
const status = element<HTMLParagraphElement>('status');
const rescan = element<HTMLButtonElement>('rescan');
const tableSection = element<HTMLElement>('table-section');
const tableList = element<HTMLDivElement>('table-list');
const selection = element<HTMLElement>('selection');
const selectionTitle = element<HTMLHeadingElement>('selection-title');
const selectionSummary = element<HTMLParagraphElement>('selection-summary');
const matrixPreview = element<HTMLDivElement>('matrix-preview');
const includeLayout = element<HTMLInputElement>('include-layout');
const siteIcons = element<HTMLInputElement>('site-icons');
const siteHint = element<HTMLParagraphElement>('site-hint');
const copy = element<HTMLButtonElement>('copy');
const exportCsv = element<HTMLButtonElement>('export-csv');
const collect = element<HTMLButtonElement>('collect');
const cancelCollect = element<HTMLButtonElement>('cancel-collect');
const actionStatus = element<HTMLParagraphElement>('action-status');
const tableWarnings = element<HTMLUListElement>('table-warnings');
const scanDiagnostics = element<HTMLUListElement>('scan-diagnostics');
const selectionState = element<HTMLSpanElement>('selection-state');
const debugReport = element<HTMLButtonElement>('debug-report');
const copyReport = element<HTMLButtonElement>('copy-report');
const exportDialog = element<HTMLDialogElement>('export-confirm');
const confirmExport = element<HTMLButtonElement>('confirm-export');
const helpDialog = element<HTMLDialogElement>('help-dialog');
const onboarding = element<HTMLDialogElement>('onboarding-dialog');
const languageSelect = element<HTMLSelectElement>('language');
const version = EXTENSION_VERSION;
let selected: TableCandidateView | undefined;
let tables: TableCandidateView[] = [];
let diagnostics: DiagnosticView[] = [];
let currentSite: string | null = null;
let collecting = false;
let cancelling = false;
let copying = false;
let scanning = false;
let validating = false;
let reporting = false;
let stale = false;
let scanError: unknown;
let scanRevision = 0;
let progressTimer: ReturnType<typeof setTimeout> | undefined;
let pendingExport: { kind: 'copy' | 'csv'; table: TableCandidateView; revision: number } | undefined;
const dialogFocus = new WeakMap<HTMLDialogElement, HTMLElement>();

function typeLabel(type: ExtractorType): string {
  return ({ 'native-table': t('typeNative'), 'aria-grid': t('typeAria'), 'div-grid': t('typeDiv'),
    'ant-design': 'Ant Design', 'element-plus': 'Element / Element Plus', 'mui-data-grid': 'MUI Data Grid', 'ag-grid': 'AG Grid' })[type];
}
function renderWarnings(target: HTMLUListElement, warnings: string[]): void {
  const messages = [...new Set(warnings)].filter(Boolean);
  target.replaceChildren(...messages.map((message) => { const item = document.createElement('li'); item.textContent = message; return item; }));
  target.hidden = messages.length === 0;
}
function diagnosticText(entry: DiagnosticView): string {
  if (entry.code.includes('FRAME')) return t('warnFrame');
  if (entry.code.includes('SHADOW')) return t('warnShadow');
  if (entry.code.includes('LOAD')) return t('warnLoading');
  if (entry.code.includes('MALFORMED') || entry.code.includes('FAILED')) return t('warnFailed');
  return t('warnUnknown');
}
function renderScanDiagnostics(): void {
  renderWarnings(element<HTMLUListElement>('scan-notices'), diagnostics.map(diagnosticText));
  renderWarnings(scanDiagnostics, diagnostics.map((entry) => `${entry.code}: ${entry.message}`));
  element('scan-details').hidden = diagnostics.length === 0;
}
function openDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  if (document.activeElement instanceof HTMLElement) dialogFocus.set(dialog, document.activeElement);
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  (dialog.querySelector<HTMLElement>('button:not(:disabled), select') ?? dialog).focus();
}
function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  dialogFocus.get(dialog)?.focus();
}
for (const dialog of [exportDialog, onboarding, helpDialog]) {
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), select, [tabindex="0"]')].filter((el) => !el.hidden);
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  dialog.addEventListener('close', () => dialogFocus.get(dialog)?.focus());
}
onboarding.addEventListener('cancel', (event) => event.preventDefault());
function updateActions(): void {
  const complete = selected ? !exportNeedsConfirmation(selected) : false;
  const blocked = !selected || exportBlocked(selected) || stale;
  copy.disabled = blocked || collecting || copying || scanning || validating;
  exportCsv.disabled = blocked || collecting || scanning || validating;
  collect.hidden = selected?.metadata.virtualized !== true || complete;
  collect.disabled = collecting || stale;
  cancelCollect.hidden = !collecting;
  cancelCollect.disabled = cancelling;
  rescan.disabled = collecting || scanning || validating;
  includeLayout.disabled = collecting || scanning || validating;
  for (const radio of tableList.querySelectorAll<HTMLInputElement>('input')) radio.disabled = collecting || validating;
  debugReport.disabled = reporting || collecting || scanning;
  copyReport.disabled = reporting || collecting || scanning;
}
function closeExportDialog(): void { pendingExport = undefined; closeDialog(exportDialog); }
function dimensions(table: TableCandidateView): { rows: string; columns: string } {
  const data = tableDiagnostics(table); return { rows: number(data.extractedRows), columns: number(data.extractedColumns) };
}
function selectTable(table: TableCandidateView): void {
  if (pendingExport) closeExportDialog();
  selected = table;
  actionStatus.textContent = stale ? t('changed') : '';
  selection.hidden = false;
  const index = tables.findIndex((candidate) => candidate.id === table.id) + 1;
  selectionTitle.textContent = table.title || t('table', { number: index });
  const data = tableDiagnostics(table);
  selectionState.textContent = completenessLabel(data.completeness);
  selectionState.dataset.completeness = data.completeness;
  selectionSummary.textContent = t('dimensions', dimensions(table));
  element('technical-summary').textContent = t('technicalSummary', { rows: table.metadata.headerRows,
    type: typeLabel(table.type), confidence: Math.round(data.confidence * 100), source: table.metadata.source ? ` · ${table.metadata.source}` : '' });
  const warnings = [completenessNotice(data), ...data.warnings.map(localizedWarning)];
  if (exportBlocked(table)) warnings.unshift(t('blocked'));
  renderWarnings(tableWarnings, warnings);
  renderWarnings(element<HTMLUListElement>('technical-warnings'), [...data.warnings.map((warning) => warning.code),
    ...table.metadata.diagnostics?.map((entry) => `${entry.code}: ${entry.message}`) ?? [],
    ...(!table.diagnostics ? table.metadata.warnings ?? [] : [])]);
  const preview = document.createElement('table');
  const caption = preview.createCaption();
  const rows = Math.min(5, table.rows.length); const columns = Math.min(8, table.columns);
  caption.textContent = t('previewCaption', { number: index, rows, columns }); caption.hidden = true;
  element('preview-scope').textContent = t('previewScope', { rows, columns });
  const body = preview.createTBody();
  for (const row of table.rows.slice(0, rows)) {
    const tr = body.insertRow();
    for (const value of row.slice(0, columns)) tr.insertCell().textContent = value;
  }
  matrixPreview.replaceChildren(preview);
  element('report-hint').textContent = '';
  updateActions();
}
function renderTables(preferredId?: string): void {
  const fragment = document.createDocumentFragment();
  const active = tables.find((table) => table.id === preferredId) ?? tables[0];
  for (const [index, table] of tables.entries()) {
    const label = document.createElement('label'); label.className = 'table-option';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'table'; radio.value = table.id;
    radio.checked = table.id === active?.id;
    radio.addEventListener('change', () => { if (!collecting && !validating) selectTable(table); });
    const description = document.createElement('span'); description.className = 'table-description';
    const heading = document.createElement('span'); heading.className = 'table-heading';
    const title = document.createElement('strong'); title.textContent = table.title || t('table', { number: index + 1 });
    const size = document.createElement('span'); size.className = 'dimensions'; size.textContent = t('dimensions', dimensions(table));
    heading.append(title, size);
    const badge = document.createElement('span'); badge.className = 'state-badge';
    badge.dataset.completeness = tableDiagnostics(table).completeness; badge.textContent = completenessLabel(tableDiagnostics(table).completeness);
    const preview = document.createElement('span'); preview.className = 'table-preview';
    preview.textContent = table.rows.slice(0, 2).map((row) => row.slice(0, 3).map((cell) => cell.replace(/\s+/g, ' ')).join(' · ')).join(' / ').slice(0, 100) || t('emptyTable');
    description.append(heading, badge, preview); label.append(radio, description); fragment.append(label);
  }
  tableList.replaceChildren(fragment); tableSection.hidden = tables.length === 0;
  if (active) selectTable(active);
}
async function loadSiteSetting(): Promise<void> {
  siteIcons.disabled = true; currentSite = null;
  try {
    const tab = await getActivePage(); currentSite = tab.url ? sitePattern(tab.url) : null;
    if (!currentSite) { siteIcons.checked = false; siteHint.textContent = t('siteUnsupported'); return; }
    siteIcons.checked = await isSiteEnabled(currentSite); siteIcons.disabled = false;
    siteHint.textContent = t('siteScope', { host: new URL(currentSite).hostname });
  } catch { siteHint.textContent = t('siteInvalid'); }
}
function renderScanStatus(): void {
  if (scanError) { status.textContent = popupErrorText(scanError, 'scanFailed'); status.dataset.state = 'error'; return; }
  if (tables.length && tables.every((table) => tableDiagnostics(table).warnings.some((warning) => warning.code === 'LOADING'))) {
    status.textContent = t('loadingEmpty'); status.dataset.state = 'loading'; return;
  }
  if (tables.length && tables.some((table) => !exportBlocked(table))) {
    status.textContent = t('scanSuccess', { count: tables.length }); status.dataset.state = 'success'; return;
  }
  const codes = diagnostics.map((entry) => entry.code);
  if (tables.length || codes.some((code) => /MALFORMED|FAILED/.test(code))) { status.textContent = t('failedEmpty'); status.dataset.state = 'failed'; }
  else if (codes.some((code) => /LOAD/.test(code))) { status.textContent = t('loadingEmpty'); status.dataset.state = 'loading'; }
  else if (codes.some((code) => /FRAME|SHADOW/.test(code))) { status.textContent = t('accessEmpty'); status.dataset.state = 'restricted'; }
  else { status.textContent = `${t('empty')} ${t('emptyHint')}`; status.dataset.state = 'empty'; }
}
async function scan(): Promise<void> {
  if (collecting) return;
  const revision = ++scanRevision; scanning = true; stale = false; scanError = undefined;
  status.textContent = t('scanLoading'); status.dataset.state = 'loading';
  tableSection.hidden = selection.hidden = true; selected = undefined;
  if (pendingExport) closeExportDialog();
  tables = []; diagnostics = []; tableList.replaceChildren(); matrixPreview.replaceChildren();
  renderWarnings(tableWarnings, []); renderScanDiagnostics(); updateActions();
  try {
    const result = await inspectActivePage({ includeLowConfidence: includeLayout.checked });
    if (revision !== scanRevision) return;
    tables = result.tables; diagnostics = result.diagnostics; renderTables(); renderScanDiagnostics(); renderScanStatus();
  } catch (error) {
    if (revision !== scanRevision) return;
    scanError = error;
    status.textContent = popupErrorText(error, 'scanFailed'); status.dataset.state = 'error';
    renderWarnings(scanDiagnostics, [error instanceof Error ? error.message : 'SCAN_FAILED']); element('scan-details').hidden = false;
  } finally { if (revision === scanRevision) { scanning = false; updateActions(); } }
}
siteIcons.addEventListener('change', () => {
  const pattern = currentSite; if (!pattern) return;
  const enabled = siteIcons.checked;
  const grant = enabled ? chrome.permissions.request({ origins: [pattern] }) : undefined;
  siteIcons.disabled = true;
  void (async () => {
    try {
      await saveSiteIcons(pattern, enabled, grant);
      try { await applyTableIconsToActivePage(enabled); siteHint.textContent = t(enabled ? 'siteOn' : 'siteOff'); }
      catch { siteHint.textContent = t('siteSaved'); }
    } catch (error) { siteIcons.checked = !enabled; siteHint.textContent = popupErrorText(error, 'settingFailed'); }
    finally { siteIcons.disabled = false; }
  })();
});
function pollProgress(): void {
  progressTimer = setTimeout(() => {
    if (!collecting || cancelling) return;
    void getActiveCollectionProgress().then((progress) => {
      if (collecting && !cancelling && progress?.running) actionStatus.textContent = t('collectionProgress', { rows: number(progress.rows) });
    }).catch(() => undefined).finally(() => { if (collecting && !cancelling) pollProgress(); });
  }, 400);
}
collect.addEventListener('click', () => {
  if (!selected?.metadata.virtualized || !exportNeedsConfirmation(selected) || collecting || stale) return;
  const id = selected.id; collecting = true; cancelling = false; actionStatus.textContent = t('collecting'); updateActions(); pollProgress();
  void collectActiveTable(id).then((table) => {
    tables = tables.map((previous) => previous.id === id ? table : previous); renderTables(id);
    actionStatus.textContent = t(table.metadata.unsupported_reason === 'ABORTED' ? 'collectCancelled'
      : tableDiagnostics(table).completeness === 'complete' ? 'collectComplete' : tableDiagnostics(table).completeness === 'current-page' ? 'collectPage' : 'collectPartial');
  }, (error: unknown) => {
    tables = tables.map((table) => table.id === id ? { ...table, metadata: { ...table.metadata, unsupported_reason: 'ABORTED' },
      diagnostics: { ...tableDiagnostics(table), completeness: 'possibly-incomplete', warnings: [...tableDiagnostics(table).warnings, { code: 'COLLECTION_ABORTED' }] } } : table);
    renderTables(id); actionStatus.textContent = popupErrorText(error, 'collectFailed');
  }).finally(() => { collecting = false; cancelling = false; clearTimeout(progressTimer); updateActions(); });
});
cancelCollect.addEventListener('click', () => {
  if (!collecting || cancelling) return;
  cancelling = true; clearTimeout(progressTimer); updateActions();
  void cancelActiveCollection().then(() => { if (collecting) actionStatus.textContent = t('cancelling'); }, () => {
    if (collecting) { cancelling = false; actionStatus.textContent = t('cancelFailed'); updateActions(); pollProgress(); }
  });
});
function downloadLocal(contents: string, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime })); const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function performExport(intent: NonNullable<typeof pendingExport>): void {
  if (intent.revision !== scanRevision || selected?.id !== intent.table.id || collecting || scanning || stale || exportBlocked(intent.table)) return;
  validating = true; actionStatus.textContent = t('checking'); updateActions();
  void validateActiveSnapshot(intent.table).then((valid) => {
    if (intent.revision !== scanRevision || selected?.id !== intent.table.id) return;
    if (!valid.valid) { stale = true; actionStatus.textContent = t('changed'); return; }
    if (intent.kind === 'csv') {
      downloadLocal(toCsv(intent.table.rows), 'text/csv;charset=utf-8', `tableflow-${tables.findIndex((table) => table.id === intent.table.id) + 1}.csv`);
      actionStatus.textContent = t('csvSuccess', dimensions(intent.table)); return;
    }
    copying = true;
    return copyMatrix(intent.table.rows).then(() => {
      if (intent.revision === scanRevision && selected?.id === intent.table.id) actionStatus.textContent = t('copySuccess', dimensions(intent.table));
    }, () => { actionStatus.textContent = t('copyFailed'); }).finally(() => { copying = false; });
  }, () => { stale = true; actionStatus.textContent = t('changed'); }).finally(() => { validating = false; updateActions(); });
}
function requestExport(kind: 'copy' | 'csv'): void {
  if (!selected || exportBlocked(selected) || collecting || scanning || copying || validating || stale) return;
  const intent = { kind, table: selected, revision: scanRevision };
  if (!exportNeedsConfirmation(selected)) { performExport(intent); return; }
  pendingExport = intent; const data = tableDiagnostics(selected);
  element('export-confirm-title').textContent = t(kind === 'copy' ? 'copyCurrent' : 'exportCurrent');
  element('export-confirm-notice').textContent = [data.virtualizationDetected ? t('virtualNotice') : completenessNotice(data),
    t('extracted', dimensions(selected)), data.expectedRows === undefined ? t('unknownRows') : t('expectedRows', { rows: number(data.expectedRows) }),
    ...(data.expectedColumns !== undefined && data.expectedColumns > data.extractedColumns ? [t('expectedColumns', { columns: data.expectedColumns })] : []), t('continueNotice')].join('\n');
  confirmExport.textContent = t('confirm', { rows: number(data.extractedRows) }); openDialog(exportDialog);
}
copy.addEventListener('click', () => requestExport('copy')); exportCsv.addEventListener('click', () => requestExport('csv'));
confirmExport.addEventListener('click', () => { const intent = pendingExport; closeExportDialog(); if (intent) performExport(intent); });
element('cancel-export').addEventListener('click', closeExportDialog);
exportDialog.addEventListener('cancel', () => { pendingExport = undefined; });

async function userReport(): Promise<string> {
  const report = selected ? await generateActiveDebugReport(selected.id) : { version,
    browser: navigator.userAgent.match(/Edg\/[\d.]+|Chrome\/[\d.]+|Chromium\/[\d.]+/)?.[0] ?? 'Chromium' };
  return JSON.stringify(report, null, 2);
}
async function copyPlainText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const input = document.createElement('textarea'); input.value = text; input.style.cssText = 'position:fixed;left:-10000px;';
  document.body.append(input); input.select();
  try { if (!document.execCommand?.('copy')) throw new Error('COPY_FAILED'); } finally { input.remove(); }
}
function requestReport(kind: 'copy' | 'download'): void {
  if (!helpDialog.open || reporting || collecting || scanning) return;
  reporting = true; updateActions();
  void userReport().then(async (report) => {
    if (kind === 'download') downloadLocal(report, 'application/json;charset=utf-8', 'tableflow-diagnostics.json');
    else await copyPlainText(report);
    element('report-status').textContent = t(kind === 'copy' ? 'reportCopied' : 'reportReady');
  }, () => { element('report-status').textContent = t('reportFailed'); }).catch(() => {
    element('report-status').textContent = t('copyFailed');
  }).finally(() => { reporting = false; updateActions(); });
}
debugReport.addEventListener('click', () => requestReport('download')); copyReport.addEventListener('click', () => requestReport('copy'));
element('help').addEventListener('click', () => {
  element('report-hint').textContent = selected ? '' : t('reportNoTable'); element('report-status').textContent = ''; openDialog(helpDialog);
});
element('close-help').addEventListener('click', () => closeDialog(helpDialog));
languageSelect.addEventListener('change', () => {
  setLanguage(languageSelect.value); void chrome.storage.local.set({ [LANGUAGE_KEY]: getLanguage() });
  localize(); element('version').textContent = t('version', { version });
  if (pendingExport) closeExportDialog();
  if (selected) renderTables(selected.id); renderScanDiagnostics(); if (!scanning) renderScanStatus(); void loadSiteSetting();
});
includeLayout.addEventListener('change', () => void scan());
rescan.addEventListener('click', () => { void loadSiteSetting(); void scan(); });
element('start-using').addEventListener('click', () => {
  void chrome.storage.local.set({ onboardingSeen: true }).then(() => { closeDialog(onboarding); void loadSiteSetting(); void scan(); });
});
window.addEventListener('pagehide', () => { clearTimeout(progressTimer); if (collecting) void cancelActiveCollection().catch(() => undefined); }, { once: true });
async function initialize(): Promise<void> {
  let settings: Record<string, unknown> = {};
  try { settings = await chrome.storage.local.get([LANGUAGE_KEY, 'onboardingSeen']); } catch { /* Local settings may be unavailable during browser shutdown. */ }
  setLanguage(typeof settings[LANGUAGE_KEY] === 'string' ? settings[LANGUAGE_KEY] as string : chrome.i18n?.getUILanguage?.() ?? 'zh-CN');
  localize(); languageSelect.value = getLanguage(); element('version').textContent = t('version', { version }); updateActions();
  if (settings.onboardingSeen !== true) openDialog(onboarding); else { void loadSiteSetting(); void scan(); }
}
void initialize();
