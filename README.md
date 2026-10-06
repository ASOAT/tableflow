# TableFlow

面向 Microsoft Edge / Chromium 的本地网页表格提取扩展，使用 Manifest V3、TypeScript、Vite 和原生 HTML/CSS。当前版本为 **v0.5.1**，发布者已提供九项真人 PASS 与实际环境，正式打包和最终 ZIP 重验通过，结论为 **READY FOR STORE SUBMISSION**。产品功能保持冻结。扩展没有运行时框架依赖，也没有业务服务器、登录、支付、AI、analytics 或网页上传。当前决定见 [最终提交报告](STORE_SUBMISSION_REPORT.md)；[RC 发布报告](RELEASE_CANDIDATE_REPORT.md)记录 RC 阶段，[v0.5.0 报告](BETA_RELEASE_REPORT.md)为上一版历史记录。

## 安装、构建与 Edge 加载

需要 Node.js 22.22.2+（22.x）、24.15.0+（24.x）或 26+。

```powershell
cd E:\Project\OpenSource\SaaS\tableflow
npm install
npm run build
```

打开 `edge://extensions` → 开发人员模式 → 加载解压缩的扩展 → 选择本项目的 `dist`。进入普通网页，点击 TableFlow，选择表格并检查预览，再复制到 Excel 或导出 CSV。源码修改后重新构建，在扩展管理页重新加载，并刷新业务网页。

“在此网站自动显示复制图标”默认关闭。启用时仅请求当前网站的可选权限；关闭时撤销授权。图标固定在可复制表格的右上角，跟随页面及容器滚动，支持查询后增行或重新创建表格。页面图标只直接复制完整/当前页结果；风险数据请在弹窗中查看提示并确认。

检测到虚拟行时，可点击“尝试收集更多行”。该操作会临时滚动网格并恢复原位置，可取消；显示实际已获取行数，完成后再点击复制或导出。无法确认总数、缺少可靠行标识、缺列、超时或达到上限时不会标记为完整。不会自动点击分页、改变排序/过滤、选择或展开业务行。

每个结果显示完整、当前页、仅当前可见、可能不完整或无法判断。业务行数排除表头和汇总；分页总计与当前导出范围分别显示。风险数据先确认当前行列数量。预览最多5行8列，复制和下载使用同一份已读取快照；导出前验证原页面、文档和表格内容，变化后必须重新扫描。完整仅表示“根据当前页面结构未检测到缺失数据”，不保证所有隐藏数据都可读取。

## 自动验收

```powershell
npm run test:install
npm run lab:install
npm run verify
```

`test:install` 下载官方 Playwright Chromium，属于开发依赖。`lab:install` 在独立目录安装已锁定的官方测试组件。`verify` 顺序执行生产与实验室检查、ESLint、测试策略检查、全部单元测试、fixture/真实组件回归、真实 Chromium 扩展 E2E 和生产构建；任意阶段失败返回非零。仅全流程成功时更新三份报告。可单独执行 `npm test`、`npm run test:components` 或 `npm run test:e2e`。

20 个独立 fixture 在 `tests/fixtures/`，对应手工固定期望在 `tests/expected/`。没有自动更新 golden 的命令。浏览器测试逐项验证候选数量、完整矩阵、表头、中文、CSV/TSV、固定列去重、Shadow DOM、iframe 和虚拟行收集；另有 80 组固定种子随机 DOM、边界测试，以及 100/1000/5000 × 20 性能记录。

真实组件实验室在 `tests/component-lab/`，独立 package/lockfile 固定 Ant Design 6.6.5、Element Plus 2.14.7、MUI X Data Grid 9.14.0、AG Grid Community 36.2.0。44 个命名场景使用真实 React/Vue 组件，其中 MUI Community pinning 仅记录商业版本限制；其他场景对照 `tests/expected/real/` 固定业务数据。另测试卸载/数据变化、真实剪贴板与下载、1000/5000×20 和虚拟10000行的性能边界。生产构建插件检查模块图，禁止实验室或框架依赖进入扩展。

报告：[真实组件兼容性](REAL_COMPONENT_COMPATIBILITY.md)、[已知限制](KNOWN_LIMITATIONS.md)、[整体验收](COMPATIBILITY_REPORT.md)。模拟 like fixture 通过不能替代真实组件版本支持结论。

浏览器验收加载真实 MV3 扩展。结构测试副本仅添加本机测试网站授权，方便自动调用 `chrome.scripting`；生产 `dist/manifest.json` 不变，并通过另外的原始扩展加载测试检查权限。Edge 原生授权提示和 Excel 实际粘贴仍需要人工确认。测试服务仅监听本机 4173/4174/4175 端口，用于同源/跨域 fixture 和组件实验室；不属于扩展产品服务。

人工测试可执行 `npm run dev`，打开 `http://localhost:5173/tests/fixtures/index.html` 或原有 `fixtures/compatibility.html`，并使用重新加载后的扩展。

## 支持边界

- 原生 `table`：th/td、thead/tbody/tfoot、多层表头、rowspan/colspan、空格、中文、隐藏文本及复杂单元格。合并内容放在左上角，其余格补空；不创建 Excel 合并单元格。
- ARIA `table/grid/treegrid`：按角色及逻辑索引恢复二维结构。
- Ant Design、Element Plus、MUI、AG Grid：支持实验室覆盖的当前 DOM 结构、固定区域、索引及详情/汇总规则，不能保证所有版本和自定义写法。
- EasyUI/jqGrid：保留已有拆分 HTML 表头、表体和固定列支持。
- 开放 Shadow DOM 与可访问同源 iframe：递归检测。
- 虚拟行：稳定行索引/键、已知总数、可验证纵向容器下进行有界收集；不抓取接口、不翻页。

低于 0.4 的候选默认隐藏，可主动显示其他可疑结构。启发式无法证明所有页面都是数据表；复制前应检查预览。缺行、缺列会显示稳定 warning code 和 evidence，经确认可导出当前数据；冲突/失败快照不可冒充有效结果。纯 checkbox/展开控制列默认忽略，具有实际业务标题/值的 checkbox 列保留；只有控件而没有可读业务文字时显示未知，不猜测勾选值。

封闭 Shadow DOM、未授权跨域 iframe、水平虚拟列、分页未加载数据以及浏览器内部页/扩展商店不支持。标准 API 无法区分没有 shadow root 和 closed root，因此只对声明了网格却不暴露行的自定义元素返回 `possible CLOSED_SHADOW_ROOT`。跨域 frame 返回 `CROSS_ORIGIN_FRAME_PERMISSION`。不绕过浏览器限制。

## 目录结构

```text
src/
  background/main.ts              网站自动图标注册
  content/
    entry.ts, engine.ts            本地扫描/收集/取消接口
    scan.ts                       旧 HTML 扫描兼容接口
    overlay.ts, auto-icons.ts      页面图标与动态更新
  extractors/
    types.ts, detect.ts, index.ts   统一候选、检测顺序与去重
    registry.ts, diagnostics.ts   自有适配器注册、完整性证据
    normalize.ts                  可见文本与矩阵规范化
    nativeTableExtractor.ts        原生表格
    ariaGridExtractor.ts           ARIA 网格
    divGridExtractor.ts            重复结构与几何启发式
    domWalker.ts                   open shadow / iframe 遍历
    html-table.ts, discovery.ts    原有矩阵及拆分表兼容
    adapters/                     Ant / Element / MUI / AG
    virtualized/                  配置、滚动与稳定行收集
  exporters/                      CSV、TSV、HTML 剪贴板
  popup/                          原生界面与扩展 API 调用
  shared/                         序列化 DTO、本地状态与网站设置
public/manifest.json
tests/
  fixtures/                       20 个独立网页及辅助 frame
  expected/                       20 份手工 golden JSON
    real/                         真实组件独立固定期望
  component-lab/                  官方包、独立 lockfile、44场景
  e2e/                            真实 MV3 Chromium、性能测试
  *.test.ts                       单元与固定种子健壮性测试
scripts/                          构建检查、本机验收服务与报告
COMPATIBILITY_REPORT.md           全流程成功后生成
REAL_COMPONENT_COMPATIBILITY.md   精确组件版本/场景/性能
KNOWN_LIMITATIONS.md              平台与实测限制
```

Shadow DOM 是可访问根的遍历方式，采用 `domWalker.ts` 统一交给已有 extractor，避免再实现一个重复的表格提取器。UI 只使用统一候选 DTO，不直接读取框架 DOM。后台只同步授权网站，不处理表格内容。

帮助入口可重新查看使用说明、切换简体中文/English，并主动复制或下载本地诊断报告。报告白名单仅含版本、浏览器版本、URL origin、计数、诊断和结构摘要；不含路径/query/token/凭据、完整 HTML、业务文本、列名、cookie、storage、表单值或行键。分享前检查来源域名；报告不会自动上传。技术代码只在展开详情后显示。

开发结构快照与性能/序列化测试接口由 `npm run build:tools` 单独输出到 `.test-artifacts/development/dev-tools.js`，不进入 dist 或 ZIP。仅在本地开发扩展中显式加载后，`TableFlowDeveloperTools.generateStructuralSnapshot(tableId)` 返回脱敏 JSON，可手动保存本地。默认移除全部文本、ID、URL、输入值、隐藏内容和敏感属性；仅保留严格允许的角色、数字索引、框架 class 与 data 属性存在信息，并限制深度和节点数。不要把开发工具加入商店包。AdapterRegistry 只接受打包到源码的自有适配器；没有用户 JS、eval、远程代码或站点配置执行。

## 权限与隐私

| 必需权限 | 用途 |
| --- | --- |
| activeTab | 用户点击后临时访问当前标签页 |
| scripting | 注入本地提取与图标脚本 |
| storage | 保存首次说明状态、界面语言和开启图标的网站规则 |

没有必需 host permissions 或 `<all_urls>`；`http://*/*`、`https://*/*` 仅声明为 optional_host_permissions，安装时不授予。图标开关只请求当前协议/域名，Chromium 网站授权不区分端口或单一路径。

不申请 tabs、downloads、clipboardRead 或 clipboardWrite。CSV 通过本地 Blob 下载；用户点击复制时写入 TSV 与 HTML，保留内部换行及行列边界，纯文本/选区复制作为回退。CSV 带 UTF-8 BOM 并正确转义逗号、引号、换行。

所有网页内容仅在当前浏览器内存处理，不持久保存表格，不发出产品网络请求。storage.local 保存 `autoIconSites`、`onboardingSeen`、`uiLanguage`。用户选择复制/下载后，剪贴板与文件由用户管理。隐私说明见 [PRIVACY_POLICY.md](PRIVACY_POLICY.md)、纯静态 `docs/privacy.html` 和[线上隐私政策](https://asoat.github.io/tableflow/privacy/)。测试依赖与 Chromium 下载、本机测试服务属于开发过程。

## 发布准备

```powershell
npm run release:check
npm run package
npm run smoke:world
```

`release:check` 包含完整 verify，再核对版本、冻结权限、图标/本地化/引用文件，以及网络调用、远程代码、source map、开发工具、测试材料和疑似凭据。`package` 只生成 `release/tableflow-edge-v0.5.1-rc.zip`，解压检查14个生产文件的 SHA-256，再加载解压内容运行真实 MV3 smoke、剪贴板及 BOM CSV 验收。ZIP根目录直接含 manifest.json；打包目前使用 Windows 自带压缩功能。

真人测试不需要开发服务器：解压RC，在Edge加载解压目录并允许文件URL访问，打开 [基础测试页](manual-qa/pages/01-basic-table.html)。Excel CSV使用 [复杂测试页](manual-qa/pages/02-complex-table.html)，缺失提示使用 [风险测试页](manual-qa/pages/03-risk-table.html)。精确矩阵在 `manual-qa/expected/`；操作见 [manual-qa/README.md](manual-qa/README.md)。

复制 `manual-qa/result.example.json` 为 `manual-qa/result.json`，填写实际日期、测试人、Edge/Windows/Excel版本和证据。9个必需项默认pending；只有真实通过才填pass。实际result.json不提交GitHub。`npm run release:final` 会拒绝未通过、版本不一致或缺少元信息的结果，并严格检查正式截图，随后完整发布检查和ZIP smoke；未通过不会生成 `release/tableflow-edge-v0.5.1.zip`。不要把Chromium或CI结果写成真人Edge/Excel通过。

静态站点位于 `site/`，部署说明见 [SITE_DEPLOYMENT.md](SITE_DEPLOYMENT.md)。`npm run site:preview` 仅用于本机预览；线上隐私URL用 `npm run check:privacy -- <URL>` 匿名检查，独立于常规verify。正式截图在 `store-assets/screenshots/{zh-CN,en}/`：`npm run check:screenshots` 严格检查，`--allow-pending`只供RC准备，不代替人工视觉审核。公共支持入口统一为 [TableFlow GitHub Issues](https://github.com/ASOAT/tableflow/issues)。Issue 面向公众，请勿提交敏感表格内容、个人信息、Token、Cookie 或完整业务数据。

发布者须本人核对 Microsoft Edge Developer account 已验证、Account type 为 Individual、Publisher display name 为 `Asoat`，确认拥有 TableFlow 代码、名称和素材的发布权，以及开发者账户联系邮箱真实有效。该账户邮箱用于账户和商店管理，无需在隐私页或商店文案公开；公共支持可使用 GitHub Issues。`publisherInfoReviewed` 的实际结论和真实测试环境、日期、测试人须记录于本地人工验收结果，CI 不能代替本人核对。

公开项目：[ASOAT/tableflow](https://github.com/ASOAT/tableflow)。静态 [主页](https://asoat.github.io/tableflow/) 和 [隐私政策](https://asoat.github.io/tableflow/privacy/) 已发布；没有新增扩展业务服务器。源码推送在Windows CI执行完整发布检查，Pages工作流只部署site目录。

`smoke:world` 独立观察十个无需登录的公开页面，记录访问、结构、完整性及实际导出，不纳入确定性CI，不承诺全网支持。截图 demo 在 `tests/store-demo/`；启动 `npm run dev` 后执行 `node store-assets/screenshots/capture.mjs` 可产生1280×800原始素材，不能当作真实Excel截图。商店文案与计划在 `store-assets/`；原生Edge、真实Excel、系统缩放和发布隐私URL的验收要求见 [MANUAL_RELEASE_CHECKLIST.md](MANUAL_RELEASE_CHECKLIST.md)。本项目不会自动提交商店；默认分支的站点修改由 GitHub Pages 工作流部署。

官方参考：[activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[Edge 本地加载](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)、[Playwright 扩展测试](https://playwright.dev/docs/chrome-extensions)。
