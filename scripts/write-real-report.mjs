import { readFile, writeFile } from 'node:fs/promises';

const unit = JSON.parse(await readFile('.test-artifacts/unit-results.json', 'utf8'));
const browser = JSON.parse(await readFile('.test-artifacts/e2e-results.json', 'utf8'));
const components = JSON.parse(await readFile('.test-artifacts/component-results.json', 'utf8'));
const performance = JSON.parse(await readFile('.test-artifacts/component-performance-results.json', 'utf8'));
const network = JSON.parse(await readFile('.test-artifacts/network-results.json', 'utf8'));
const lab = JSON.parse(await readFile('tests/component-lab/package-lock.json', 'utf8'));
const version = JSON.parse(await readFile('package.json','utf8')).version;
if (!unit.success || unit.numFailedTests || unit.numPendingTests || browser.stats.unexpected
  || browser.stats.skipped || browser.stats.flaky || network.externalRequests) throw new Error('Real compatibility reports require a fully passing verify run.');
const cases = components.results;
if (cases.length < 20 || performance.results.length < 3) throw new Error('Real component/performance evidence is incomplete.');
const families = { antd: 'antd', 'element-plus': 'element-plus', mui: '@mui/x-data-grid', 'ag-grid': 'ag-grid-community' };
for (const [family, name] of Object.entries(families)) {
  const installed = lab.packages[`node_modules/${name}`]?.version;
  if (!installed || !cases.some((entry) => entry.family === family && entry.version === installed && entry.extraction === 'PASS')) {
    throw new Error(`Missing verified exact official package version: ${family}`);
  }
}
const notes = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const rows = cases.map((entry) => `| ${notes(entry.family)} | ${notes(entry.version)} | ${notes(entry.scenario)} · ${notes(entry.label)} | ${notes(entry.extraction)} | ${notes(entry.completeness)} | ${notes(entry.e2e)} | ${entry.rows} 行 / ${entry.columns} 列；${notes((entry.warnings ?? []).join(', '))} |`).join('\n');
const perf = performance.results.map((entry) => `| ${entry.family} | ${entry.dataRows} | ${entry.detectMs.toFixed(2)} | ${entry.extractMs.toFixed(2)} | ${(entry.diagnosticsMs ?? 0).toFixed(2)} | ${entry.csvMs.toFixed(2)} | ${entry.tsvMs.toFixed(2)} | ${entry.collectionMs === undefined ? '—' : `${entry.collectionMs.toFixed(0)} ms / ${entry.collectedRows} 行 / ${entry.status}`} |`).join('\n');
await writeFile('REAL_COMPONENT_COMPATIBILITY.md', `# TableFlow v${version} 真实组件兼容性

生成时间：${new Date().toISOString()}。仅在完整 npm run verify 成功后生成。

本轮 ${unit.numTotalTests} 项单元测试与 ${browser.stats.expected} 项 Playwright 测试全部通过，0 失败、0 跳过。${cases.length} 个真实组件场景，其中 ${cases.filter((entry) => entry.extraction === 'PASS').length} 个执行真实组件 DOM 提取；商业版能力声明不计为提取支持。正式支持结论仅适用于以下精确版本与场景，模拟 like fixture 不能替代这些证据。

组件安装在 tests/component-lab 独立 package 中，版本固定、lockfile 保留，生产扩展无 React/Vue/组件框架依赖。构建插件逐项检查实际生产 chunk 的模块图，另检查生产无网络 API、动态代码、远程脚本/配置及测试 URL 分支。

| Component | Exact Version | Scenario | Extraction | Completeness Detection | E2E | Notes |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

ENGINE+SERIALIZERS 表示真实 Chromium 已加载扩展、真实 DOM 的矩阵与手工 Golden 对比且 CSV/TSV 反向解析一致；PASS 另覆盖实际 Popup 选择、状态、warning、确认及剪贴板/Blob 下载。MUI Community 的 pinning 不伪装为支持，也没有安装 Pro/Premium/Enterprise。

## 完整性与证据

ExtractionDiagnostics 记录 complete、current-page、visible-only、possibly-incomplete、unknown，业务行数排除表头/汇总；实际列数以已渲染逻辑列为准。ARIA 声明、结构化分页总计/范围、行列索引、测量滚动容器和适配器事实形成 evidence，不把任意年份或页面数字当总数。完整状态说明“根据当前页面结构未检测到缺失数据”，不作绝对保证。

当前页可直接导出，并明确当前范围及可读取总数。风险状态先确认再导出实际已读矩阵；无效结构、提取失败和过期快照不可伪装成正常 CSV。虚拟收集有时间、行数、迭代与无进展上限，检测身份/列宽变化、缺口和中途卸载，恢复滚动及可恢复的焦点，不触发排序、过滤、分页、选择、展开或提交。

warning codes：PAGINATION_DETECTED、VIRTUALIZATION_DETECTED、ROW_COUNT_MISMATCH、COLUMN_COUNT_MISMATCH、VISIBLE_ROWS_ONLY、POSSIBLY_INCOMPLETE、LOW_CONFIDENCE、CROSS_ORIGIN_FRAME、CLOSED_SHADOW_ROOT、FIXED_COLUMN_CLONES_REMOVED、CONTROL_COLUMNS_IGNORED、UNKNOWN_GRID_STRUCTURE、LOADING、EXTRACTION_FAILED、COLLECTION_ABORTED、COLLECTION_LIMIT。

## 真实组件性能（本机毫秒）

| Component | 数据行 | detect | extract | diagnostics | CSV | TSV | 虚拟收集 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${perf}

计时是一次验收样本，不设不现实的绝对 SLA。虚拟 10000 行的 detect/extract/diagnostics/CSV/TSV 计时针对初始已渲染窗口（${performance.results.find((entry) => entry.collectionMs !== undefined)?.rows - 1} 条业务行），不代表全量 10000 行提取；虚拟收集单独报告实际收集行数、耗时和受配置上限影响的部分状态，不能伪造完整数据或无限滚动。

## 验收范围与隐私

Chrome headless 工具栏弹窗不能作为 Playwright Page 操作；UI 用同一原始 Popup 页面在扩展标签页执行并保留业务页 active。结构测试副本只增加 localhost 授权；原始生产 manifest 另外真实加载验证，生产文件未增加 host 权限。实际剪贴板和下载内容经过验证，Edge 原生权限提示与 Excel 实际粘贴未自动化。

生产权限仍为 activeTab、scripting、storage；optional host 仅为用户主动开启的网站图标，未增加任何生产网络请求。本轮记录 ${network.observedRequests} 个本机实验室/扩展资源请求，外部请求 ${network.externalRequests}，记录不监控浏览器其他进程流量。

行为迁移：按本阶段明确要求，默认去除纯控制列。手工更正模拟 Golden 06 的 checkbox 空列和 07 的 checkbox/展开空列，保留全部业务值及顺序；没有用自动生成期望或跳过断言掩盖差异。

用户可在帮助中主动生成本地诊断 JSON，严格白名单包含版本、浏览器、无路径/query/token/凭据的 origin、提取器、诊断与结构计数；不包含业务文本/HTML、列名、cookie、storage、表单值或行键。性能/序列化回归工具另建显式测试 bundle，不暴露在正式生产扫描器中；结构快照工具也仅存在于开发 bundle。

真实 AG Grid G11 隐藏列场景的业务矩阵为正确的 4 列，DOM 却仍声明 aria-colcount=5。不能仅凭该证据区分主动隐藏和未渲染列，因此保守显示 possibly-incomplete 与 COLUMN_COUNT_MISMATCH，而不冒充完整。只手工调整该场景的诊断期望，业务值及顺序未变。

下一阶段建议：收集脱敏真实 DOM 建立版本差异回归；提升虚拟收集进度与缺口定位；明确范围后设计声明式站点规则。当前阶段没有用户 JavaScript、站点 adapter、远程配置或执行任意代码。
`, 'utf8');
await writeFile('KNOWN_LIMITATIONS.md', `# TableFlow v${version} 已知限制

- 兼容性限定为 REAL_COMPONENT_COMPATIBILITY.md 的官方包精确版本和已测试 DOM 场景，不承诺所有 React/Vue 应用或自定义 renderer。
- 不翻页、不读取组件私有 JS 状态或服务端接口。分页只导出当前页，未暴露可靠 total 时不猜测总数。
- 不进行水平虚拟列收集。缺列会标记 COLUMN_COUNT_MISMATCH / possibly-incomplete；用户确认后可导出已读列，不能描述成完整表。
- AG Grid 36.2.0 的隐藏列仍可能计入 aria-colcount；G11 实际可见 4 列而声明 5 列，矩阵正确但保守提示缺列。声明列数与实际观察数一致时才认可稀疏逻辑索引属于已隐藏列。
- 有名称的业务列若只有 checkbox/radio 等控件而没有可读文字，会保留该列并显示 unknown；不猜测布尔值，确认导出后该单元格仍为空。纯选择/展开控制列默认排除。
- 虚拟行需要稳定逻辑索引/键、可靠范围与可测滚动容器；无总数、缺口、行身份/列宽/汇总变化、卸载、超时或上限时保持部分或失败状态。不能恢复已卸载的焦点元素；可恢复元素与两个滚动轴均尝试保留。
- MUI Community 默认分页且每页最多 100 行；pinning 属于商业版本，本阶段未安装或测试。AG Enterprise 专有能力未测试。
- Closed Shadow DOM 无法访问，shadowRoot=null 也可能表示没有根；只对不透明声明网格提供可能性诊断。跨域 iframe 无法通过 DOM 同源访问；不会绕过或请求 all_urls。相关 warning 会影响页面完整性结论。
- 通用 div 判断是启发式，可能误判；低置信度默认隐藏，unknown/风险结果需要明确确认。
- 空表、尚未加载或不暴露行列结构的页面可能只返回空状态/全局诊断，不生成假数据。
- 原生 span/ARIA/AG 安全预算会限制异常大的二维展开，返回有界诊断预览而非冒充全量。常规 5000×20 场景另有性能验收。
- Edge 原生安装/权限对话框、受限内部页和实际 Excel 格式仍需人工验证；headless Chrome 的测试授权与 Popup 页面方式写入报告，未伪装为原生工具栏验收。
- 没有登录、付费、AI、云服务、遥测、用户 JavaScript 或用户自定义站点适配器。Debug JSON 只在本地生成；结构计数与 origin 本身也应由用户自行检查后分享。
`, 'utf8');
console.log(`Real component reports generated from ${cases.length} scenarios and ${performance.results.length} performance records.`);
