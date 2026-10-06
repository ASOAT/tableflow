import type { DiagnosticWarning } from './diagnostics';

export type UiLanguage = 'zh-CN' | 'en';
export const LANGUAGE_KEY = 'uiLanguage';
const zh = {
  subtitle: '把网页数据带到 Excel', rescan: '重新扫描', help: '帮助', settings: '扫描与复制设置',
  siteIcons: '在此网站显示复制图标', siteLoading: '正在读取网站设置…', includeLayout: '显示低可信度和其他表格',
  scanLoading: '正在读取当前页面的表格…', scanSuccess: '发现 {count} 个数据表。请选择并核对预览。',
  empty: '没有找到数据表。', emptyHint: '等待网页加载后重新扫描，或勾选“显示低可信度和其他表格”。',
  loadingEmpty: '页面仍在加载表格，请稍后重新扫描。', accessEmpty: '部分内嵌页面无法读取，其表格未包含在结果中。',
  failedEmpty: '找到了表格结构，但暂时无法可靠读取。请刷新页面后重新扫描。',
  scanDenied: '无法读取此页面。浏览器内部页、扩展商店和部分受限页面不支持扫描。本地文件需在扩展详情中允许访问文件网址。',
  noTab: '没有找到当前标签页，请打开普通网页后重试。', internalPage: '浏览器内部页面无法扫描。请切换到包含表格的普通网页。',
  scanFailed: '扫描失败，请刷新网页后重试。', changed: '网页已变化，请重新扫描。当前预览的数据暂不可导出。',
  collectFailed: '收集失败，请重新扫描后重试。', reportFailed: '无法生成报告，请重新扫描后重试。',
  permissionDenied: '未获得此网站的授权。仍可在 Popup 中扫描和复制。', settingFailed: '设置失败，请重试。',
  syncFailed: '无法保存自动图标设置，请在扩展管理页重新加载 TableFlow 后重试。',
  siteUnsupported: '自动图标支持 HTTP / HTTPS 网站。本地文件可在 Popup 中复制。',
  siteScope: '仅对 {host} 生效；开启时由 Edge 请求此网站授权。', siteInvalid: '此页面不支持自动图标，请切换到普通网页。',
  siteOn: '已开启：完整数据表显示复制图标，刷新或下次访问也会自动显示。', siteOff: '已关闭：已移除图标并撤销此网站的自动访问授权。',
  siteSaved: '设置已保存。请刷新当前网页，让设置生效。',
  choose: '选择表格', detected: '检测到的表格', table: '表格 {number}', dimensions: '{rows} 行 × {columns} 列',
  complete: '完整', currentPage: '当前页', visibleOnly: '仅当前可见', possiblyIncomplete: '可能不完整', unknown: '无法判断',
  completeNotice: '根据当前页面结构，未检测到数据缺失。', pageNotice: '当前仅导出本页 {rows} 行。',
  pageTotal: '页面显示总计约 {rows} 行。', pageOther: '其他分页数据未包含在当前结果中。',
  visibleNotice: '当前仅包含已渲染的 {rows} 行，可能还有未读取的数据。',
  possibleNotice: '结果可能不完整。当前已提取 {rows} 行{expected}。', expectedSuffix: '，页面预计约 {rows} 行',
  unknownNotice: '未能确认数据范围，当前已提取 {rows} 行。', blocked: '当前结构提取失败或已取消，复制和导出暂不可用。请重新扫描。',
  emptyTable: '空表格', preview: '所选表格预览', previewCaption: '表格 {number} 的前 {rows} 行、前 {columns} 列',
  previewScope: '预览前 {rows} 行、前 {columns} 列；导出使用同一份已读取的数据。',
  copy: '复制到 Excel', csv: '导出 CSV', collect: '尝试收集更多行', cancelCollect: '取消收集',
  collecting: '正在滚动读取已加载的数据，可点击取消。完成后再点击复制。', collectComplete: '已收集数据，未检测到缺失。请点击复制到 Excel 或导出 CSV。',
  collectionProgress: '正在读取表格…已获取 {rows} 行，可点击取消。',
  collectPage: '当前页数据已收集，请核对页面范围后导出。', collectCancelled: '已取消收集，已恢复页面滚动位置；当前结果不可导出，请重新扫描。',
  collectPartial: '收集结束，已恢复页面滚动位置，但数据仍可能不完整。请查看提示。', cancelling: '正在取消收集并恢复页面位置…',
  cancelFailed: '取消请求未成功，请重试。', checking: '正在检查预览数据是否仍有效…',
  copySuccess: '已复制 {rows} 行 × {columns} 列，请在 Excel 中粘贴。', copyFailed: '复制失败。请保持网页或 Popup 获得焦点，再点击复制。',
  csvSuccess: 'CSV 已生成，{rows} 行 × {columns} 列。', copyCurrent: '复制当前数据', exportCurrent: '导出当前数据',
  virtualNotice: '此表格可能只显示部分数据。', extracted: '当前已提取：{rows} 行 × {columns} 列',
  expectedRows: '页面预计约：{rows} 行', unknownRows: '页面总行数尚未确认。', expectedColumns: '页面声明：{columns} 列，部分列未包含在当前结果中。',
  continueNotice: '可以继续导出当前数据，或取消后尝试收集、重新扫描。', confirm: '导出当前 {rows} 行', cancel: '取消',
  details: '查看技术详情', technicalSummary: '表头 {rows} 行 · {type} · 识别可信度 {confidence}%{source}',
  scanHints: '扫描提示', tableHints: '所选表格提示', footer: '数据仅在本地处理，不上传网页内容',
  onboardingTitle: '三步把表格带到 Excel', onboarding1: '打开包含表格的网页，点击 TableFlow。',
  onboarding2: '选择表格，核对预览和数据范围提示。', onboarding3: '点击“复制到 Excel”后粘贴，或导出 CSV。',
  onboardingPrivacy: '网页内容只在本地浏览器处理，不上传、不统计你的使用行为。', start: '开始使用',
  helpTitle: '使用帮助', helpScope: '分页表格只读取当前页。滚动表格可能只有部分行或列，请核对范围提示。',
  helpExcel: '在 Excel 中选择起始单元格后粘贴。CSV 使用 UTF-8 并带 BOM，方便中文 Excel 打开。',
  reportTitle: '反馈问题', reportPrivacy: '报告包含版本、网站来源和结构诊断，不含单元格业务内容、输入值、完整网址或网址参数。分享前请检查网站来源，勿附上敏感业务数据。',
  reportCopy: '复制问题报告', reportDownload: '下载诊断 JSON', reportReady: '已生成本地诊断报告，不包含表格业务内容。',
  reportCopied: '问题报告已复制，不包含表格业务内容。', reportNoTable: '未选中表格时，报告仅包含扩展和浏览器版本。',
  version: '版本 {version}', language: '界面语言', close: '关闭',
  warnPagination: '当前仅包含本页 {extracted} 行{total}。', warnTotal: '，页面显示总计约 {rows} 行',
  warnVirtual: '网页只呈现部分行或列，当前结果可能不是全部数据。', warnRows: '当前读取 {extracted} 行，页面声明约 {expected} 行。',
  warnColumns: '当前读取 {extracted} 列，页面声明 {expected} 列；横向滚动可能隐藏其他列。',
  warnVisible: '当前结果仅包含已渲染的行；可尝试收集，或确认后导出当前数据。',
  warnPossible: '当前结果可能不完整，请核对缺行、缺列和页面加载状态。', warnLow: '此结构的识别可信度较低，请检查预览。',
  warnFrame: '存在不可读取或尚未就绪的内嵌页面，其数据未包含在结果中。',
  warnShadow: '存在不暴露表格结构的自定义网格，其数据可能未包含在结果中。',
  warnClones: '已去除固定区域的重复列。', warnControls: '已忽略纯选择或展开控制列。',
  warnUnknown: '此网格的完整性证据不足，暂不能确认完整范围。',
  warnControl: '有单元格仅显示选择控件，缺少可读取的文字；导出不会转换其勾选状态，请检查预览。',
  warnLoading: '页面仍在加载数据，请稍后重新扫描。', warnFailed: '结构提取失败或存在冲突，不能生成可靠导出。',
  warnAborted: '收集已取消或页面已变化，当前结果暂不可导出。', warnLimit: '收集达到时间或行数上限，结果可能不完整。',
  typeNative: 'HTML 表格', typeAria: 'ARIA 表格', typeDiv: '网页网格',
} as const;
type MessageKey = keyof typeof zh;
const en: Record<MessageKey, string> = {
  subtitle: 'Bring web tables into Excel', rescan: 'Scan again', help: 'Help', settings: 'Scan and copy settings',
  siteIcons: 'Show copy icons on this site', siteLoading: 'Reading site settings…', includeLayout: 'Show other and low-confidence tables',
  scanLoading: 'Reading tables on this page…', scanSuccess: 'Found {count} data tables. Select one and check the preview.',
  empty: 'No data tables found.', emptyHint: 'Wait for the page to load and scan again, or show other tables.',
  loadingEmpty: 'Tables are still loading. Please scan again shortly.', accessEmpty: 'Some embedded pages cannot be read. Their tables are not included.',
  failedEmpty: 'A table structure was found, but could not be read reliably. Refresh the page and scan again.',
  scanDenied: 'This page cannot be read. Browser pages, extension stores and restricted pages are unsupported. Local files require file access in extension settings.',
  noTab: 'No active tab found. Open a regular web page and try again.', internalPage: 'Browser pages cannot be scanned. Switch to a regular page containing a table.',
  scanFailed: 'Scan failed. Refresh the page and try again.', changed: 'The page has changed. Scan again before exporting this preview.',
  collectFailed: 'Collection failed. Scan again and retry.', reportFailed: 'Could not create the report. Scan again and retry.',
  permissionDenied: 'Site permission was not granted. You can still scan and copy in the popup.', settingFailed: 'Could not save settings. Please retry.',
  syncFailed: 'Could not save copy icon settings. Reload TableFlow on the extension management page and retry.',
  siteUnsupported: 'Automatic icons support HTTP / HTTPS sites. Local files can be copied in the popup.',
  siteScope: 'Applies only to {host}. Edge will request permission for this site.', siteInvalid: 'This page does not support automatic icons. Switch to a regular website.',
  siteOn: 'Enabled: complete data tables show a copy icon, including after a reload or future visit.', siteOff: 'Disabled: icons removed and automatic site access revoked.',
  siteSaved: 'Settings saved. Refresh the page to apply them.', choose: 'Select a table', detected: 'Detected tables', table: 'Table {number}', dimensions: '{rows} rows × {columns} columns',
  complete: 'Complete', currentPage: 'Current page', visibleOnly: 'Visible only', possiblyIncomplete: 'Possibly incomplete', unknown: 'Cannot determine',
  completeNotice: 'No missing data detected in the current page structure.', pageNotice: 'Only the {rows} rows on this page will be exported.',
  pageTotal: 'The page indicates approximately {rows} rows in total.', pageOther: 'Other pages are not included.',
  visibleNotice: 'Only the {rows} rendered rows are included. More data may remain unread.', possibleNotice: 'The result may be incomplete. {rows} rows extracted{expected}.',
  expectedSuffix: '; the page indicates approximately {rows}', unknownNotice: 'The data scope could not be determined. {rows} rows extracted.',
  blocked: 'Extraction failed or was cancelled. Copy and export are unavailable. Scan again.', emptyTable: 'Empty table', preview: 'Selected table preview',
  previewCaption: 'First {rows} rows and {columns} columns of table {number}', previewScope: 'Previewing the first {rows} rows and {columns} columns. Export uses this same data snapshot.',
  copy: 'Copy to Excel', csv: 'Export CSV', collect: 'Try collecting more rows', cancelCollect: 'Cancel collection',
  collecting: 'Scrolling to read loaded rows. You can cancel. Click copy separately when finished.', collectComplete: 'Collection finished with no missing data detected. Copy to Excel or export CSV.',
  collectionProgress: 'Reading the table…{rows} rows collected. You can cancel.',
  collectPage: 'Current-page data collected. Check the scope before exporting.', collectCancelled: 'Collection cancelled and scroll position restored. This result cannot be exported. Scan again.',
  collectPartial: 'Collection finished and scroll position restored, but data may still be incomplete. Check the notices.', cancelling: 'Cancelling collection and restoring scroll position…',
  cancelFailed: 'Cancellation failed. Please retry.', checking: 'Checking whether the preview is still valid…',
  copySuccess: 'Copied {rows} rows × {columns} columns. Paste into Excel.', copyFailed: 'Copy failed. Keep the page or popup focused, then click copy again.',
  csvSuccess: 'CSV created: {rows} rows × {columns} columns.', copyCurrent: 'Copy current data', exportCurrent: 'Export current data',
  virtualNotice: 'This table may show only part of its data.', extracted: 'Extracted: {rows} rows × {columns} columns',
  expectedRows: 'Page indicates approximately {rows} rows', unknownRows: 'The total row count is not confirmed.', expectedColumns: 'The page declares {columns} columns. Some are missing from this result.',
  continueNotice: 'Export the current data, or cancel to collect more rows or scan again.', confirm: 'Export these {rows} rows', cancel: 'Cancel',
  details: 'View technical details', technicalSummary: '{rows} header rows · {type} · {confidence}% recognition confidence{source}',
  scanHints: 'Scan notices', tableHints: 'Selected table notices', footer: 'Processed locally. Web content is never uploaded.',
  onboardingTitle: 'Bring a table into Excel in three steps', onboarding1: 'Open a page with a table and click TableFlow.',
  onboarding2: 'Select a table and check the preview and scope notices.', onboarding3: 'Copy to Excel and paste, or export CSV.',
  onboardingPrivacy: 'Web content is processed only in your browser. No uploads or usage analytics.', start: 'Get started',
  helpTitle: 'How to use TableFlow', helpScope: 'Paginated tables include only the current page. Scrolling tables may contain only some rows or columns. Check scope notices.',
  helpExcel: 'Select the starting cell in Excel and paste. CSV files use UTF-8 with a BOM for Chinese text support.',
  reportTitle: 'Report a problem', reportPrivacy: 'Reports include versions, site origin and structural diagnostics. They exclude cell content, input values, full page URLs and URL parameters. Check the origin before sharing and do not attach sensitive business data.',
  reportCopy: 'Copy problem report', reportDownload: 'Download diagnostic JSON', reportReady: 'Local diagnostic report created. No cell content is included.',
  reportCopied: 'Problem report copied. No cell content is included.', reportNoTable: 'Without a selected table, the report contains only extension and browser versions.',
  version: 'Version {version}', language: 'Interface language', close: 'Close',
  warnPagination: 'Only {extracted} rows from this page are included{total}.', warnTotal: '; approximately {rows} rows in total',
  warnVirtual: 'The page renders only some rows or columns. This result may exclude data.', warnRows: '{extracted} rows read; the page declares approximately {expected}.',
  warnColumns: '{extracted} columns read; the page declares {expected}. Horizontal scrolling may reveal more columns.',
  warnVisible: 'Only rendered rows are included. Try collecting more rows or confirm export of the current data.', warnPossible: 'The result may be incomplete. Check for missing rows, columns and loading state.',
  warnLow: 'Recognition confidence is low. Check the preview.', warnFrame: 'An embedded page cannot be read or is not ready. Its data is not included.',
  warnShadow: 'A custom grid does not expose its structure. Its data may not be included.', warnClones: 'Duplicate fixed columns were removed.', warnControls: 'Selection or expansion controls were excluded.',
  warnUnknown: 'There is insufficient evidence to determine the full data scope.', warnControl: 'Some cells show only controls without readable text. Their checked state is not converted. Check the preview.',
  warnLoading: 'Data is still loading. Scan again shortly.', warnFailed: 'Extraction failed or has conflicting structure. A reliable export is unavailable.',
  warnAborted: 'Collection was cancelled or the page changed. This result cannot be exported.', warnLimit: 'Collection reached a time or row limit. The result may be incomplete.',
  typeNative: 'HTML table', typeAria: 'ARIA table', typeDiv: 'Web grid',
};
let language: UiLanguage = 'zh-CN';
export function setLanguage(value: string): void { language = value.toLowerCase().startsWith('en') ? 'en' : 'zh-CN'; }
export function getLanguage(): UiLanguage { return language; }
export function number(value: number): string { return value.toLocaleString(language); }
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  const message = language === 'en' ? en[key] : zh[key];
  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}
export function localize(root: Document = document): void {
  root.documentElement.lang = language;
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as MessageKey);
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel as MessageKey));
}
export function localizedWarning(warning: DiagnosticWarning): string {
  const info = warning.metadata ?? {};
  const count = (value: unknown) => typeof value === 'number' ? number(value) : '';
  switch (warning.code) {
    case 'PAGINATION_DETECTED': return t('warnPagination', { extracted: count(info.extracted), total: info.total === undefined ? '' : t('warnTotal', { rows: count(info.total) }) });
    case 'ROW_COUNT_MISMATCH': return t('warnRows', { extracted: count(info.extracted), expected: count(info.expected) });
    case 'COLUMN_COUNT_MISMATCH': return t('warnColumns', { extracted: count(info.extracted), expected: count(info.expected) });
    case 'UNKNOWN_GRID_STRUCTURE': return t(info.reason === 'unreadable-business-control' ? 'warnControl' : 'warnUnknown');
    default: return t(({ VIRTUALIZATION_DETECTED: 'warnVirtual', VISIBLE_ROWS_ONLY: 'warnVisible', POSSIBLY_INCOMPLETE: 'warnPossible', LOW_CONFIDENCE: 'warnLow', CROSS_ORIGIN_FRAME: 'warnFrame', CLOSED_SHADOW_ROOT: 'warnShadow', FIXED_COLUMN_CLONES_REMOVED: 'warnClones', CONTROL_COLUMNS_IGNORED: 'warnControls', LOADING: 'warnLoading', EXTRACTION_FAILED: 'warnFailed', COLLECTION_ABORTED: 'warnAborted', COLLECTION_LIMIT: 'warnLimit' } as const)[warning.code]);
  }
}
