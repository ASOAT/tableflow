# TableFlow v0.5.1 RC 真人验收入口

此包不依赖开发服务器或网络。双击 `pages/01-basic-table.html` 后选择 Microsoft Edge Stable 打开；三个页面底部可互相跳转。数据均为虚构，`expected/` 中的矩阵由人工编写，不由提取器生成。

## 一次设置

1. 解压 `release/tableflow-edge-v0.5.1-rc.zip`，在 `edge://extensions` 开启开发人员模式，选择“加载解压缩的扩展”，选中解压后的目录。
2. 打开 TableFlow 的扩展“详细信息”，打开“允许访问文件 URL”。这仅用于本地测试页，测试后可关闭。
3. 将 TableFlow 固定在工具栏；用真正的工具栏弹窗测试。首次说明确认后即可操作。

## 三页快速验证

| 页面 | 操作 | 预期 |
| --- | --- | --- |
| `pages/01-basic-table.html` | 复制到空白 Excel 工作表的 A1 | 5×6；中文、金额、日期与空位正确（E3、D4、F4 为空） |
| `pages/02-complex-table.html` | 导出 CSV，用 Excel 直接打开；也可复制对照 | 6×6；合并区域规则展开；F3 保留单元格内换行，F4 引号完整，F5 逗号不造成错列 |
| `pages/03-risk-table.html` | 复制或 CSV，先取消，再确认 | “可能不完整”，4/12 条；取消无副作用；确认只得到实际 5×4，不补出缺行 |

Excel 可自动识别数字和日期，因此显示格式变化不等同于数据损坏；核对实际金额和日期值。单元格换行需在 Excel 中开启“自动换行”查看。若直接打开 CSV 错列，记录 Excel 的语言和分隔符区域设置，保留 CSV 与截图，不用导入向导掩盖直接打开的失败。

完整 Edge、Excel、权限及版本检查见根目录 `MANUAL_RELEASE_CHECKLIST.md`。Windows“设置 → 系统 → 屏幕 → 缩放”分别设为 100%、125%、150%；每次重新打开工具栏 Popup 和风险对话框，检查按钮、文本、滚动。浏览器网页缩放或自动化截图不能替代系统缩放。

## 填写真实结果

新克隆项目后，先复制 `result.example.json` 为 `result.json`（Windows 终端：`copy manual-qa\result.example.json manual-qa\result.json`）。实际 `result.json` 仅保留在本地，不提交到 GitHub，避免上传测试人和人工备注。

编辑 `result.json`：填写 `testedAt`（实际日期 `YYYY-MM-DD`，或带时区的实际 ISO 日期时间；不知道具体时间时只填日期）、`tester`、`edgeVersion`、`windowsVersion`、`excelVersion` 与实际 `privacyUrlValue`。版本可在 `edge://version`、Windows“关于”、Excel“文件 → 账户 → 关于 Excel”查到。隐私地址须为无账号密码、查询参数或片段的真实匿名 HTTPS URL。

各必需项目只能按真实结论填 `pending`、`pass` 或 `fail`。结果全部通过后才把九个必需项改为小写 `pass`；记录对应 `evidence`（截图/文件路径或公开 URL）及 `notes`。未执行、失败或不确定都不能写 `pass`。不要把 CI 或 Playwright Chromium 的结果抄成真人 Edge / Excel 通过。

`publisherInfoReviewed` 须由本人按根目录清单核对账户验证、Individual 账号类型、`Asoat` 显示名称、代码/名称/素材发布权和 Microsoft 开发者账户真实有效的联系邮箱。账户邮箱不要求公开；公共支持入口为 [TableFlow GitHub Issues](https://github.com/ASOAT/tableflow/issues)。Issues 公开可见，请勿提交敏感表格内容、个人信息、账号密码、Token、Cookie 或完整业务数据。

`npm run release:final` 会读取这个文件；任一必需项不是 `pass` 时必须拒绝生成正式 ZIP。真人验收完成前只使用 `-rc.zip`。
