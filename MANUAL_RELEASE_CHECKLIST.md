# TableFlow v0.5.1 RC 人工发布验收

本清单为人工验收标准，实际结论与证据填写到 `manual-qa/result.json`。自动化 Chromium 验收不能替代 Microsoft Edge Stable、真实 Microsoft Excel 和 Windows 系统缩放，不得自动写为通过。

## 环境与入口

- TableFlow：0.5.1；加载 `release/tableflow-edge-v0.5.1-rc.zip` 的解压目录。
- 实际测试日期/时区、测试人：待填写。
- Edge Stable 版本、Windows 版本、Excel 版本及语言/区域：待填写。
- 本地入口：`manual-qa/pages/01-basic-table.html`，双击并选择 Edge Stable；扩展详细信息开启“允许访问文件 URL”。完成后可关闭。
- 独立手写矩阵：`manual-qa/expected/`；完整快速说明：`manual-qa/README.md`。

## Edge Stable（result.json：edgeStable）

逐项在真正的 Edge Stable 工具栏 Popup 中执行，全部通过才能记录 `edgeStable: "pass"`。

- [ ] 待人工完成：从 RC ZIP 解压目录加载，图标及版本 0.5.1 正确，首次说明可完成。
- [ ] 待人工完成：本地基础表识别及预览正确，复制和 CSV 都可用。
- [ ] 待人工完成：打开公开 [Ant Design Table](https://ant.design/components/table/)，记录实际检出的表格、范围与导出结果；限制或失败须记录，不能按“支持所有网站”判定。
- [ ] 待人工完成：打开公开 [Element Plus Table](https://element-plus.org/en-US/component/table.html)，记录实际检出的表格、范围与导出结果。
- [ ] 待人工完成：关闭再打开 Popup，重新扫描当前页，首次说明不会重复弹出。
- [ ] 待人工完成：打开 Popup 预览后刷新页面，再次操作必须使用重新扫描的数据；旧快照不可继续导出。
- [ ] 待人工完成：风险页显示“可能不完整”和 4/12 条；先取消，确认没有文件或剪贴板副作用，再确认只导出实际 5×4。
- [ ] 待人工完成：帮助中的本地诊断报告可复制/下载，不含单元格业务文本、输入值或完整页面 URL。
- [ ] 待人工完成：重新加载扩展后可重新打开 Popup 扫描；重载前的数据不能被静默复用。
- [ ] 待人工完成：核对按网站授权的图标设置、拒绝授权、撤销和卸载清理；权限提示与当前 manifest 相符，没有额外必需权限。

## Test E1 · Excel Clipboard（excelClipboard）

1. 在 Microsoft Edge Stable 中加载 RC 解压后的扩展。
2. 打开 `manual-qa/pages/01-basic-table.html`，TableFlow → 选中基础表 → 复制到 Excel。
3. 打开实际 Microsoft Excel，在空白工作表 A1 按 Ctrl+V。

- [ ] 待人工完成：含表头 5 行 × 6 列；没有错位或多出数据。
- [ ] 待人工完成：张三、李四等中文正确；金额实际值 1234.50、0.00、-98.50、88.80 正确。
- [ ] 待人工完成：日期实际值正确；E3、D4、F4 保持为空。
- [ ] 待人工完成：复杂页复制后为 6×6，合并范围只在左上角保留值，内部换行、逗号和引号没有错列。

以上全部通过后才填写 `excelClipboard: "pass"`。Excel 自身数字/日期显示格式变化可接受，必须记录会影响数据值的转换。

## Test E2 · Excel CSV（excelCsv）

1. 打开 `manual-qa/pages/02-complex-table.html`，用 TableFlow 导出 CSV。
2. 用实际 Microsoft Excel 直接打开该 CSV，不先通过导入向导修改解析规则。

- [ ] 待人工完成：中文无乱码，含表头与总计共 6 行 × 6 列。
- [ ] 待人工完成：F5 `北京,上海` 是一个字段；D3 `1,234.50` 仍属于金额列。
- [ ] 待人工完成：F4 `他说"已审核"` 双引号完整。
- [ ] 待人工完成：F3 为同一单元格内两行；可开启 Excel“自动换行”确认。
- [ ] 待人工完成：合并展开与空位符合 `02-complex-table.json`，中文金额和日期正确。

全部通过后才填写 `excelCsv: "pass"`。失败时保留文件与截图，记录 Excel 语言及 Windows 区域分隔符设置。

## Windows 系统缩放

进入 Windows“设置 → 系统 → 屏幕 → 缩放”，保持网页缩放 100%，分别更改系统缩放。每档重新打开工具栏 Popup、首次说明/帮助及风险对话框。不能只用网页 Ctrl+加号或截图模拟。

- [ ] 待人工完成：100%（`scale100`）。
- [ ] 待人工完成：125%（`scale125`）。
- [ ] 待人工完成：150%（`scale150`）。

每档 PASS 标准：主要按钮未裁切；文本不重叠；对话框可操作；没有页面级横向滚动；状态文字始终可见；预览表自己的横向滚动可正常操作。逐档保留截图与结论。

## 发布材料与责任信息

- [ ] 待人工完成：正式截图视觉审核（`screenshotsReviewed`），1280×800，文字可读、无调试截图、无虚构评价或背书；展示 Excel 的截图必须来自真实 Excel。
- [ ] 待人工完成：实际 HTTPS 隐私 URL（`privacyUrl`），匿名 HTTP 200 且无需登录，内容与当前版本一致；执行 `npm run check:privacy -- https://asoat.github.io/tableflow/privacy/`，保留检查结果，并由本人确认页面包含 GitHub Issues 支持入口。
- [ ] 待人工完成：发布者账户及发布权审核（`publisherInfoReviewed`），按下列标准由发布者本人逐项核对。
- [ ] 待人工完成：Windows Narrator 实际朗读首次说明、选表、状态、风险确认及错误，记录可用性问题。

`publisherInfoReviewed: "pass"` 的人工标准：

- Microsoft Edge Developer account 已验证。
- 本人核对 Account type 为 `Individual`。
- 本人核对 Publisher display name 为 `Asoat`。
- 发布者本人确认拥有 TableFlow 代码、名称和素材的发布权。
- 本人核对 Microsoft 开发者账户中存在真实有效的联系邮箱。
- 该账户联系邮箱用于账户和商店管理，不要求公开展示；公开私人邮箱不是 `release:final` 的必要条件。
- 本人核对公共支持入口可使用 [TableFlow GitHub Issues](https://github.com/ASOAT/tableflow/issues)。Issues 是公开渠道，页面及文案应提醒用户不要提交敏感表格内容、个人信息、账号密码、Token、Cookie 或完整业务数据。

以上是核对标准，不表示维护者已由自动化验证账户、姓名、权利或邮箱。市场、listing 和其他提交字段另按 Partner Center 清单核对。

Partner Center 提交步骤另见 `store-assets/PARTNER_CENTER_CHECKLIST.md`；没有访问或操作 Partner Center 就不能勾选完成。

## 自动工程检查的边界

`verify`、`release:check`、ZIP smoke、静态素材检查和确定性 DOM/CSV/剪贴板矩阵已由自动工具覆盖，以当前 `RELEASE_CANDIDATE_REPORT.md` 实际结果为准。它们不能替代上面的真人结果，也不能覆盖未通过的自动检查。

当九个必需项目都真实为 `pass`、版本/日期/环境及证据完整时，才可执行 `npm run release:final`。此前仅允许 RC ZIP，不能称为 READY FOR STORE SUBMISSION。
