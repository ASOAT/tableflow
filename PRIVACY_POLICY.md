# TableFlow 隐私政策 / Privacy Policy

适用产品：TableFlow / Microsoft Edge 桌面浏览器扩展。适用版本：0.5.1 Release Candidate。政策更新时间：2026-10-06。

## 数据访问与用途

用户主动点击扩展后，TableFlow 在本地访问当前页面及可访问页面区域中完成表格导出所必需的 DOM、文本和相关结构信息。用途仅限检测网页表格、生成预览、复制到 Excel、生成 CSV，以及提供完整性诊断。网页表格可能含有个人或业务信息；“本地处理”不表示扩展不访问网页数据。

用户可单独开启某个网站的自动复制图标。浏览器批准该网站权限后，已打包的本地脚本会在该授权网站识别表格并显示图标。关闭开关会停止该网站的自动图标功能并撤销相应授权。授权按协议和域名生效，不区分单一路径或端口。

用户选择“尝试收集更多行”时，扩展可能临时滚动当前网格以读取已能在页面中显示的行，并恢复原位置；用户可取消。扩展不自动登录、不点击分页、不调用网站数据接口，也不执行用户提供的脚本。跨域内嵌页面、封闭 Shadow DOM、未加载数据等区域可能无法读取。

## 数据存储与保留

表格快照和提取诊断仅在相关浏览器页面的运行内存中处理，不持久写入扩展的偏好存储。新的扫描可能替换快照，刷新或关闭相关页面会释放该页面内存。扩展不会建立表格内容数据库或浏览历史记录。

`chrome.storage.local` 保存以下真实偏好：

`autoIconSites`：字符串数组，记录用户开启自动图标的网站授权规则（协议和域名）。关闭某个网站的图标会从该列表移除相应规则。

`onboardingSeen`：布尔值，记录用户是否完成首次使用说明。

`uiLanguage`：字符串，记录界面语言选择（简体中文或 English）。

这些偏好会在重新打开扩展后保留，直到相应设置被修改、由浏览器清除或移除扩展。它们不包含表格业务单元格内容。

复制会把用户选择的数据写入系统剪贴板；导出会通过浏览器生成本地 CSV 文件。剪贴板和文件可能在操作结束后继续保留，由用户自行删除、覆盖或管理。

用户可在帮助中主动复制或下载本地诊断报告。报告包含扩展和浏览器版本、页面来源域名（origin）、提取类型、诊断代码及结构计数，不包含业务单元格文本、完整 HTML、URL 路径或查询参数、cookie、表单值或网页存储。域名和计数也可能透露使用环境，分享前应自行检查。脱敏结构快照是单独的本地开发工具，不随商店扩展发布。

## 数据传输、第三方与跟踪

网页表格内容不会上传至 TableFlow 服务器。当前版本没有 TableFlow 业务服务器、账户系统或云服务；扩展没有外部业务网络请求，不使用 analytics、telemetry 或广告跟踪，不出售用户数据，不发送网页内容给 AI 或第三方，不跨网站建立用户画像，也不下载远程执行代码。

复制和下载是用户主动创建的本地输出，不会自动发送给维护者。用户随后选择分享文件或报告、使用云剪贴板或粘贴到其他应用时，相关服务的处理由用户选择的提供方负责，不由 TableFlow 控制。网页本身、Microsoft Edge、扩展商店及目标应用也有各自的数据处理规则。

## 权限与用户控制

必需权限是 `activeTab`、`scripting`、`storage`，分别用于用户点击后临时访问当前标签页、执行随扩展打包的本地脚本和保存上述偏好。没有必需的全网站主机权限；可选 HTTP/HTTPS 网站权限只在用户开启网站图标时请求，安装不会自动授予所有网站访问权。

用户可不启用自动图标、关闭已启用的网站图标、在 Edge 中管理网站权限、取消行收集或移除扩展。浏览器管理扩展偏好的清除；已导出的文件和剪贴板需由用户自行删除或覆盖。扩展不请求浏览历史、cookie、剪贴板读取或下载管理的额外权限，不调用 cookie 或认证接口。

## 隐私网站托管

本网站页面完全静态，没有 JavaScript、analytics、第三方字体、广告或跟踪像素，页面本身不设置 cookie。第一版静态隐私网站使用 GitHub Pages 托管。访问该网站会向托管方发送正常网页请求；GitHub 官方说明，Pages 会为安全目的记录并存储访问者 IP 地址。这属于访问静态网站的托管行为，不是扩展上传网页表格内容。请参阅 [GitHub Pages 数据收集说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)及 [GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)。

## 联系方式与政策更新

公开隐私联系邮箱：[REQUIRED BEFORE RELEASE]。此项必须由发布者在正式发布前填写真实可用的邮箱；当前没有编造联系方式。政策对应上述版本的实际行为，功能或数据处理变化时需要同步更新日期和内容。

## English

Product: TableFlow, a desktop Microsoft Edge extension. Applicable version: 0.5.1 Release Candidate. Policy updated: 2026-10-06.

### Data access and purpose

After you actively click the extension, TableFlow locally accesses the DOM, text, and related structure needed to export tables from the current page and accessible areas. Its purposes are limited to detecting web tables, generating previews, copying to Excel, generating CSV, and providing completeness diagnostics. Tables may contain personal or business information; local processing does not mean that the extension never accesses page data.

You may separately enable automatic table icons for a website. After the browser approves that site's permission, the packaged local script detects tables and displays icons on that permitted website. Turning the setting off stops this feature and removes the corresponding permission. Website permissions cover a scheme and hostname, rather than a single path or port.

If you choose to collect more rows, the extension may temporarily scroll the current grid to read rows that the page can display and then restore its position. You can cancel. It does not automatically log in, click pagination, call website data APIs, or run user-provided scripts. Cross-origin frames, closed Shadow DOM, and unloaded data may be inaccessible.

### Storage and retention

Table snapshots and extraction diagnostics are processed in the related page's browser memory. They are not persisted in extension preference storage. A new scan may replace a snapshot; refreshing or closing the page releases that page's memory. The extension does not maintain a table-content database or browsing-history log.

`chrome.storage.local` holds only these actual preferences:

`autoIconSites`: a string array of website permission rules (scheme and hostname) where you enabled automatic icons. Disabling a site's icons removes its rule.

`onboardingSeen`: a boolean recording whether you completed the first-use explanation.

`uiLanguage`: a string recording your interface language choice (Simplified Chinese or English).

Preferences persist across reopening the extension until changed, cleared by the browser, or the extension is removed. They do not contain business cell contents.

Copying writes selected data to the system clipboard; exporting creates a local CSV file through the browser. Clipboard contents and files may remain after the operation. You manage, delete, or overwrite them.

You can explicitly copy or download a local diagnostic report from Help. It contains extension and browser versions, the page origin, extraction type, diagnostic codes, and structural counts. It excludes business cell text, full HTML, URL paths or query parameters, cookies, form values, and page storage. Origins and counts may reveal your environment; review reports before sharing. Redacted structural snapshots are a separate local development tool and are excluded from the store extension.

### Transmission, third parties, and tracking

Web table content is not uploaded to a TableFlow server. This version has no TableFlow business server, account system, or cloud service. The extension makes no external business network requests, uses no analytics, telemetry, or advertising tracking, sells no user data, sends no page content to AI or third parties, builds no cross-site user profiles, and downloads no remote executable code.

Clipboard and file exports are local outputs you request. They are not automatically sent to the maintainer. If you subsequently share a file or report, use a cloud clipboard, or paste into another application, your chosen provider controls that processing. Websites, Microsoft Edge, the extension store, and destination applications have their own data practices.

### Permissions and control

Required permissions are `activeTab`, `scripting`, and `storage`, used for temporary access to the active tab after your click, running packaged local scripts, and storing the preferences above. There is no required all-sites host permission. Optional HTTP/HTTPS access is requested only when you enable a site's icons; installation does not grant access to every website.

You can leave automatic icons disabled, disable a site's icons, manage permissions in Edge, cancel row collection, or remove the extension. The browser manages preference removal; exported files and clipboard contents require your own cleanup. The extension requests no additional browsing-history, cookie, clipboard-read, or download-management permissions and calls no cookie or authentication APIs.

### Hosting of this privacy website

These pages are entirely static, with no JavaScript, analytics, third-party fonts, advertising, or tracking pixels. The pages themselves set no cookies. The first privacy website uses GitHub Pages. Visiting it sends normal website requests to the host; GitHub states that Pages logs and stores visitor IP addresses for security. This hosting activity is separate from the extension's local processing and does not upload the tables you export. See [GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection) and the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

### Contact and changes

Public privacy contact email: [REQUIRED BEFORE RELEASE]. The publisher must replace this with a genuine working email before final release. No address has been invented. This policy describes the version above; changes to features or data handling require an updated policy and date.
