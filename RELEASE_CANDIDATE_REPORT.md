# TableFlow v0.5.1 Release Candidate

验收日期：2026-10-06。RC 阶段结论：**READY FOR MANUAL QA**。本轮发布者随后确认九项真人 PASS 并提供实际环境，完整正式流程及最终 ZIP 独立重验已通过；当前最终决定为 **READY FOR STORE SUBMISSION**，详见 [STORE_SUBMISSION_REPORT.md](STORE_SUBMISSION_REPORT.md)。产品功能、提取器与固定业务 Golden 未改。

## 自动验收

| 项目 | 结果 |
| --- | --- |
| `npm run verify` | PASS（由release:check完整执行），exit 0 |
| `npm run release:check` | PASS，exit 0；版本一致性、冻结权限、14文件、无测试/开发API/source map/远程代码/凭据 |
| Tests | **439 passed / 0 failed / 0 skipped**：346单元 + 93真实Chromium扩展E2E；v0.5.0的368项保留 |
| `npm run package` | PASS，exit 0，kind=rc |
| GitHub Windows CI | PASS：干净环境安装、release:check与RC打包；[本轮实际作业](https://github.com/ASOAT/tableflow/actions/runs/37452638685)，源码提交331ee5c |
| 解压RC ZIP smoke | PASS：原始manifest/UI、本地TSV、BOM CSV、独立反解析矩阵、开发API未暴露 |
| 隐私URL检查 | PASS：匿名HTTPS、HTTP200、HTML、TableFlow/Privacy正文、无本机引用 |
| 正式截图技术检查 | PASS：中英文各5张PNG，1280×800，缺失0；发布者已确认真人视觉pass，技术检查器仍保留固定人工提醒 |
| `npm run release:final` | PASS，完整重试 exit 0；九项真人PASS与真实元信息通过原有guard，正式ZIP和独立重验均成功 |

类型/锁文件/manifest/Popup共用package.json版本源，并有漂移拒绝测试；实际浏览器UI与诊断版本也核对。新增测试覆盖离线手写矩阵、版本漂移、人工guard、匿名隐私URL、纯静态站点与PNG校验。没有skip/only/todo，没有删旧测试或降低矩阵/诊断/性能断言。

## RC ZIP与权限

文件：`release/tableflow-edge-v0.5.1-rc.zip`。大小：**68,098字节**。SHA-256：`2b3d265f770661c7d7c6a73e53285f390713a0209b19920fb1d72ccb2a51d9be`。本轮仅同步公开支持与隐私文案。

ZIP根目录直接包含manifest.json，共14个生产文件。解压目录`.test-artifacts/packages/unpacked-6anYll`全部文件哈希与dist一致；site/manual-qa/store-assets/源码/开发数据不进入ZIP。正式ZIP已由完整release:final流程生成，SHA及两次smoke详见最终提交报告。

必需权限保持 **activeTab、scripting、storage**。无必需host_permissions、all_urls、tabs、history、cookies、webRequest、downloads或剪贴板额外权限。网站图标仅使用已有可选授权。受控扩展回归外部请求**0**，ZIP smoke外部请求**0**；GitHub部署、依赖安装和公开静态网页访问与扩展业务请求分开。

## GitHub与实际隐私站点

- 公开仓库：[ASOAT/tableflow](https://github.com/ASOAT/tableflow)，本地main已连接origin。
- 主页：[TableFlow](https://asoat.github.io/tableflow/)。政策：[Privacy Policy](https://asoat.github.io/tableflow/privacy/)。
- [本轮Pages部署作业](https://github.com/ASOAT/tableflow/actions/runs/37452638536)成功，公开支持已更新为GitHub Issues。
- 已实际执行 `npm run check:privacy -- https://asoat.github.io/tableflow/privacy/`，匿名返回200 HTML；证据`.test-artifacts/privacy-url-check.json`。不自动改真人privacyUrl结果。
- `site/`只含静态HTML，没有JavaScript、第三方字体、analytics、cookie或广告。隐私正文与docs及Markdown一致，披露真实autoIconSites/onboardingSeen/uiLanguage和GitHub Pages安全IP日志。
- 站点部署工作流只上传site，官方Actions固定到已核对的提交。[Windows CI](https://github.com/ASOAT/tableflow/actions/runs/37452638685)已实际成功：源码提交331ee5c，干净环境安装依赖、完整release:check与RC package。此结果不代替真人Edge/Excel验收。
- 公开支持与隐私联系入口统一为 [TableFlow GitHub Issues](https://github.com/ASOAT/tableflow/issues)。这是公开渠道，政策已提醒不要提交敏感表格、个人信息、Token、Cookie或完整业务数据。Microsoft开发者账户真实邮箱用于账户及商店管理，无需在公开政策中展示。部署说明见[SITE_DEPLOYMENT.md](SITE_DEPLOYMENT.md)。

## 最简单的真人入口

1. 用真实Microsoft Edge Stable加载RC ZIP解压目录；为本地测试开启“允许访问文件URL”。
2. 直接双击[基础表](manual-qa/pages/01-basic-table.html)，复制到实际Excel A1：含表头5×6，核对中文、金额、日期和空位（E1）。
3. 打开[复杂表](manual-qa/pages/02-complex-table.html)导出CSV，直接用真实Excel打开：6×6，合并展开、中文、逗号、双引号与单元格内换行（E2）。
4. [风险页](manual-qa/pages/03-risk-table.html)验证4/12条提示及先取消后确认；只导出实际5×4。上述三页不需要开发服务器或网络，矩阵在manual-qa/expected由人工独立编写。

Windows“设置→系统→屏幕→缩放”依次100%/125%/150%，每次重开真正的Edge工具栏Popup与风险dialog，检查按钮、重叠、滚动和状态。自动视口/设备比例模拟不能代替此项。

[manual-qa/README.md](manual-qa/README.md)提供最短操作；[MANUAL_RELEASE_CHECKLIST.md](MANUAL_RELEASE_CHECKLIST.md)记录Edge/Windows/Excel版本、日期、公开Ant/Element、reopen/refresh/reload、权限、诊断、卸载及Excel要求。3页file:// Chromium渲染与DOM自动验证通过，但没有假称已使用真实Edge或Excel。

## 人工结果与正式放行

发布者在当前对话明确确认9个必需键全部pass：edgeStable、excelClipboard、excelCsv、scale100、scale125、scale150、screenshotsReviewed、privacyUrl、publisherInfoReviewed。已据此填写本地`manual-qa/result.json`，测试人Asoat，日期2026-10-06，政策地址为上述真实URL；Windows、Edge Stable、Excel版本按本人随后提供的真实值记录。没有补造具体时间、截图或附件。实际结果只留本地、Git忽略；新克隆使用result.example.json中的pending模板。

`release:final`先要求全部真实小写pass、对应0.5.1、有效日期、测试人和Edge/Windows/Excel版本、匿名HTTPS政策地址，再完整发布检查、严格截图检查、正式ZIP解压smoke。它不填写或伪造任何人工结果。Partner Center仍未操作或提交。

## 商店材料

截图在`store-assets/screenshots/zh-CN/`与`en/`，每种语言5场景；`compose.mjs`可复现真实390×580 Popup捕获与本地版式，合成数据明确标注。发布者已确认真人视觉审核pass；技术检查器的固定人工提醒不代表自动工具代替了该审核。第03张只有实际复制反馈，没有伪造Excel窗口或微软背书。

原创`store-assets/logo-300.png`直接以300×300渲染，未放大128px图标。双语listing、中文6项/英文5项关键词、[CERTIFICATION_NOTES.md](store-assets/CERTIFICATION_NOTES.md)和[PARTNER_CENTER_CHECKLIST.md](store-assets/PARTNER_CENTER_CHECKLIST.md)已准备。Partner Center每项均待人工完成。

## 仍需人工完成与已知限制

发布者已确认九项真人验收通过，并补齐真实Windows、Edge Stable、Excel版本和测试日期；人工guard、完整release:final及最终ZIP两次smoke均通过。未操作Partner Center上传或Submit。账号邮箱只需真实有效，不要求公开；Individual账户类型、Asoat显示名称及发布权由本人核对。市场和商店提交字段继续由发布者本人完成。

产品限制保持：分页不自动翻页；closed Shadow DOM、未授权跨域iframe、未加载数据和水平虚拟列不能保证全量；快照变化必须重新扫描，虚拟收集受稳定索引/数量/时间限制。上一版真实公开网站观察中Ant快照被拒绝与AG访问限制仍需实站追踪，不宣称任意网站支持。Excel区域分隔符、日期/金额自动格式需要实际应用验收。

RC阶段为 **READY FOR MANUAL QA**；真实人工要求及正式流程现已完成，当前最终结论为 **READY FOR STORE SUBMISSION**，不表示商店已提交或批准。
