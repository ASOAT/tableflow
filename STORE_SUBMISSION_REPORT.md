# TableFlow v0.5.1 Store Submission Report

验收日期：2026-10-06。结论：**READY FOR STORE SUBMISSION**。

九项真人结果及实际环境由发布者 Asoat 在本轮对话明确提供；本地结果已通过原有 guard。完整正式发布流程和最终 ZIP 两次解压 smoke 均通过。此结论表示材料与包可以提交，不表示已上传、已点击 Submit 或商店已批准。

## 自动验收与正式包

| 项目 | 实际结果 |
| --- | --- |
| `npm run verify` | PASS，exit 0 |
| `npm run release:check` | PASS，exit 0；独立执行及正式流程中的完整重跑均通过 |
| Tests | **439 passed / 0 failed / 0 skipped / 0 flaky**：346 单元 + 93 Chromium 扩展测试 |
| `npm run package` | PASS，更新后的 RC ZIP 解压 smoke 通过 |
| `npm run release:final` | PASS，完整重试 exit 0；未修改 guard、跳过测试或降低断言 |
| 正式截图技术校验 | PASS，中文、英文各 5 张，1280×800；视觉 PASS 由发布者本人确认 |
| 正式 ZIP 内置解压 smoke | PASS，2 个扩展测试上下文，TSV/CSV 独立反解析矩阵一致 |
| 最终 ZIP 独立重新解压 smoke | PASS，重新从最终 ZIP 解压到新目录，文件哈希与 dist 一致，2 个测试上下文全部通过 |
| [GitHub Windows CI](https://github.com/ASOAT/tableflow/actions/runs/37452638685) | PASS，源码提交 331ee5c；干净环境 release:check 和 RC package |

正式文件：`release/tableflow-edge-v0.5.1.zip`（本地生成，未上传到 GitHub 或 Partner Center）。大小：**68,098 字节**，14 个生产文件，ZIP 根目录直接包含 manifest.json，版本 0.5.1。

SHA-256：

```text
a58a5d11320cb0d43ac037e4048620cc09eeb41ebf57b4b3c4aae9cf9b443391
```

内置解压目录：`.test-artifacts/packages/unpacked-VhHyJk`。独立重验目录：`.test-artifacts/packages/final-resmoke-WH8ZNN`。两次均验证首次使用、帮助、本地隐私页、实际剪贴板 TSV、UTF-8 BOM CSV、行列及单元格矩阵、未暴露开发 API，外部请求 **0**。功能 smoke 所需本机网站授权仅用于临时测试副本，不进入正式 ZIP。

首次正式流程在浏览器测试启动时发生 Windows 进程异常退出（exit -1073740791），当时未生成正式 ZIP。仅清理已核实的两个残留测试服务后，从同一个 `release:final` 入口完整重跑成功；没有使用旧测试记录覆盖失败。原始失败记录与完整重试日志分别保存在 `.test-artifacts/final-first-attempt.json`、`.test-artifacts/final-release-retry.log`。

## 公开支持与隐私站点

公共支持与隐私询问入口：[TableFlow GitHub Issues](https://github.com/ASOAT/tableflow/issues)。Issues 是公开渠道；中英文政策及商店文案提醒用户不要提交敏感表格内容、个人信息、Token、Cookie 或完整业务数据。Microsoft 开发者账户的真实联系邮箱用于账户和商店管理，无需公开，未在政策或 listing 中公开个人邮箱。

[隐私政策](https://asoat.github.io/tableflow/privacy/)已由[本轮 Pages 作业](https://github.com/ASOAT/tableflow/actions/runs/37452638536)重新部署成功。实际运行 `npm run check:privacy -- https://asoat.github.io/tableflow/privacy/`，**PASS：匿名 HTTPS、HTTP 200、HTML、无需登录**。额外检查确认公开 Issues 链接存在、占位符不存在、敏感信息提醒存在，线上 HTML 与审核后的本地政策字节一致。

`PRIVACY_POLICY.md`、`docs/privacy.html`、`site/privacy/index.html` 内容一致。除联系方式外，实际 DOM 访问、数据用途、本地存储键、保留、权限、传输和 GitHub Pages 托管说明保持真实。站点仍完全静态，无 JavaScript、analytics、第三方字体、广告或页面 cookie。

## 发布者提供的真人结果

测试人：Asoat。实际日期：2026-10-06；未补造具体时间。

| 环境 | 发布者提供的实际值 |
| --- | --- |
| Windows | Microsoft Windows 25H2，OS 内部版本 26200.9457 |
| Edge Stable | 154.0.4258.62，正式版本，64 位 |
| Excel | Microsoft Excel LTSC MSO 16.0.14334.20918，64 位 |

| 必需项目 | 结果来源与结论 |
| --- | --- |
| edgeStable | 发布者确认 pass |
| excelClipboard | 发布者确认 pass |
| excelCsv | 发布者确认 pass |
| scale100 | 发布者确认 pass |
| scale125 | 发布者确认 pass |
| scale150 | 发布者确认 pass |
| screenshotsReviewed | 发布者确认 pass |
| privacyUrl | 发布者确认 pass；线上自动检查另已通过 |
| publisherInfoReviewed | 发布者确认 pass，标准已按本轮要求更正 |

`publisherInfoReviewed` 标准包括开发者账户已验证、Individual 类型、Asoat 显示名称、代码/名称/素材发布权、有效账户联系邮箱，以及 GitHub Issues 公共支持入口。账户邮箱无需公开；没有声称自动工具访问或验证了 Microsoft 账户。

实际 `manual-qa/result.json` 仅保存在本地并由 Git 忽略，公开模板仍全部 pending。未生成不存在的截图、附件或人工操作证据；自动 Chromium 检查与发布者提供的真人结果分别记录。

## 范围与权限

本轮没有新增产品功能、修改 extractor、扩大权限或重构架构。`src/`、manifest、人工 guard 和打包脚本未改。必需权限仍为 **activeTab、scripting、storage**，没有必需全网站 host permission。可选网站权限仍仅用于用户主动开启的网站图标。

受控扩展回归与两次正式 ZIP smoke 的外部请求均为 **0**。网页内容在本地处理；公开政策、GitHub 部署和开发依赖下载属于独立行为，不是扩展上传业务数据。

## 本轮修改文件

- 政策：`site/privacy/index.html`、`docs/privacy.html`、`PRIVACY_POLICY.md`。
- 商店文案：`store-assets/listing-zh-CN.md`、`store-assets/listing-en.md`。
- 人工标准：`store-assets/PARTNER_CENTER_CHECKLIST.md`、`MANUAL_RELEASE_CHECKLIST.md`、`manual-qa/README.md`。
- 同步说明：`README.md`、`SITE_DEPLOYMENT.md`、`STORE_PRIVACY_CHECKLIST.md`、`RELEASE_CANDIDATE_REPORT.md`。
- 回归断言：`tests/privacy-site.test.ts`，现有隐私联系检查改为公开 Issues、敏感信息提醒和无邮箱占位。
- 自动更新的回归报告：`COMPATIBILITY_REPORT.md`、`REAL_COMPONENT_COMPATIBILITY.md`。
- 新增本报告；本地 `manual-qa/result.json` 按本人提供的结果填写，未提交 Git。

## 提交步骤与已知限制

双语 listing、300×300 Logo、中英文各 5 张正式截图、关键词和 [Certification Notes](store-assets/CERTIFICATION_NOTES.md)已准备。按 [Partner Center checklist](store-assets/PARTNER_CENTER_CHECKLIST.md)由发布者本人选择市场/可见性、填入真实隐私 URL、上传正式 ZIP 与素材、审核最终预览并点击 Submit。这些实际商店操作未由本任务执行。

已知产品限制保持：不自动翻页；closed Shadow DOM、未授权跨域 iframe、未加载数据或水平虚拟列无法保证全量；页面数据变化后需要重新扫描，虚拟行收集受稳定索引与数量/时间限制。不宣称支持任意网站或数据绝对完整。
