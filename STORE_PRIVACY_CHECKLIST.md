# Edge 商店隐私披露核对表

核对版本：0.5.1 Release Candidate。核对日期：2026-10-06。依据：[Microsoft Edge 发布指南](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)的 Privacy 流程和[开发者政策](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)。以下是当前代码事实映射；提交时仍需逐项阅读实际 Partner Center 字段定义，不能把“没有上传”填写成“没有访问网页内容”。

| 问题/披露事项 | 当前事实 | 提交说明与代码依据 |
| --- | --- | --- |
| Single purpose | 网页表格复制、CSV 导出与缺失风险提示 | 不声称万能抓取；src/content、src/popup、src/exporters |
| activeTab | 用户点击后临时访问当前标签页 | 当前页面本地提取，不后台浏览其他网站 |
| scripting | 注入已打包的本地脚本 | 没有远程脚本或任意用户脚本 |
| storage | 本地偏好 | autoIconSites 字符串数组、onboardingSeen 布尔值、uiLanguage 字符串；不是表格数据库 |
| 可选网站权限 | 用户开启某网站复制图标才申请 | optional_host_permissions 声明 HTTP/HTTPS；逐网站申请，无必需 all_urls |
| 是否访问网页内容 | 是 | 读取表格结构和可见文本；若涉及个人信息，仍是访问个人信息，不因本地处理而否认 |
| 是否传输网页内容给维护者/第三方 | 扩展不自动传输 | 生产无 fetch/XHR/WebSocket/远程代码；无 TableFlow 业务服务器。用户主动分享输出或使用云剪贴板由目标服务处理 |
| 是否持久存储网页表格内容 | 扩展偏好存储不保存 | 运行内存有快照；用户复制/下载产生剪贴板或文件，需要分开披露 |
| 是否记录浏览历史 | 不记录 | 用户选择的自动图标网站规则保存在本地；不把该规则列表写成“什么网站信息都不保存” |
| 是否读取 cookie/认证信息 | 不使用 cookie 或认证 API | 不抓取网站接口，不自动登录 |
| 诊断报告 | 用户显式本地复制/下载 | 含 origin 和结构计数，排除业务文本/HTML/cookie/输入值/storage；不自动上传 |
| 数据保留 | 页面内存快照与持久偏好分开 | 新扫描可替换快照，刷新/关闭页面释放内存；偏好保留到修改或由浏览器清除/移除扩展；用户自行管理导出文件和剪贴板 |
| analytics/telemetry/广告跟踪 | 无 | 测试依赖不属于生产 SDK；构建检查防止框架实验室进入 dist |
| 第三方生产 SDK | 无 analytics 或数据服务 SDK | 生产原生界面；React/Vue/组件包仅测试实验室 |
| Remote code | No, I am not using remote code | MV3 本地打包代码，禁止远程配置执行/eval |
| Data usage 类别 | 必须披露网页内容的本地访问与处理 | 按表单对 collection/access 的实际定义选择适用项，并附本地用途说明；不要机械填写“无数据访问” |
| 数据出售/无关用途/画像 | 无 | 只服务用户明确发起的导出及其开启的图标功能 |
| Privacy policy URL | 部署与匿名访问结果见 RELEASE_CANDIDATE_REPORT.md | 发布 site/ 到 GitHub Pages，填写真实 HTTPS 的 privacy/ 地址；运行 check:privacy 并匿名打开后填写 Partner Center。本地路径不可代替 |
| 静态隐私网站托管 | GitHub Pages 的安全访问日志单独披露 | GitHub 会记录网站访问者 IP；网站没有脚本/analytics/第三方资源，托管日志不是扩展上传网页表格 |
| 支持与发布者信息 | [REQUIRED BEFORE RELEASE] | 政策的公开隐私联系邮箱必须由发布者填写真实邮箱；Partner Center Support contact 字段为可选，不得编造联系方式 |

提交前保存实际 Partner Center 披露截屏，逐项与最终 ZIP、PRIVACY_POLICY.md 和商店文案复核。该表不代表 Partner Center 已填写或已提交。Pages 配置、仓库或 workflow 存在不能代替公开 URL 的真实检查。部署步骤见 [SITE_DEPLOYMENT.md](SITE_DEPLOYMENT.md)，发布者人工确认见 [store-assets/PARTNER_CENTER_CHECKLIST.md](store-assets/PARTNER_CENTER_CHECKLIST.md)。
