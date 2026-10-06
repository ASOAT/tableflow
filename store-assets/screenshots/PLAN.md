# 五张正式截图计划

目标为 5 张，统一 1280×800 PNG。微软允许最多 6 张，规格为 640×480 或 1280×800；本项目统一采用 1280×800。依据：[Edge 发布指南](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)。素材只使用 `tests/store-demo/` 合成数据，不能含真实用户信息。

| 文件名 | 场景 | 真实操作与审核重点 |
| --- | --- | --- |
| `01-detect.png` | 自动发现网页表格 | 正式扩展发现列表，展示合成订单页；不得画假候选或伪称支持所有网站 |
| `02-preview.png` | 导出前预览数据 | 选中表格，显示真实预览、行列数和数据范围 |
| `03-excel.png` | 一键复制到 Excel | 必须真实复制；可先取实际“已复制”反馈。Excel 窗口只接受真人粘贴后的实际截图；没有 Excel 就保持待人工，不用网页冒充 Excel |
| `04-integrity.png` | 数据可能不完整时主动提醒 | `virtual.html` 的实际可见范围和风险确认，不声称收集全部10000行 |
| `05-privacy.png` | 网页数据仅在浏览器本地处理 | 真正的帮助说明或静态隐私页；网站上线状态须以实际检查为准 |

正式目录：`store-assets/screenshots/zh-CN/` 与 `store-assets/screenshots/en/`。界面文字较多，默认分别取景；确实无需语言区分时，允许在 `assets.json` 将英文设置为 `{ "reuse": "zh-CN" }` 并由人工确认可读性。

当前状态：中英文各5张1280×800候选已自动生成，技术校验 **PASS**，仍为 **MANUAL REVIEW REQUIRED**。目录中的 `.gitkeep` 仅保留目录。第03张展示真实复制成功反馈，没有 Excel 窗口；真人 Excel 粘贴和最终视觉审核尚未完成。

`compose.mjs` 的实际390×580扩展原图、本地静态排版HTML和生成记录在 `.test-artifacts/store-compositions/`。原始素材和诊断记录不能整批复制到正式目录，也不得将 debug、raw、fixture 或诊断截图混入正式目录。

复现这10张候选：先运行 `npm run build` 和 `npm run dev`，再运行 `node store-assets/screenshots/compose.mjs`。脚本从当前 `dist` 加载实际 MV3 扩展，逐语言捕获未重绘的390×580 Popup及现有合成订单页，真实点击复制并检查剪贴板矩阵，然后通过本地静态HTML排版生成1280×800 PNG；只给测试副本增加本机网站授权。没有生成 Excel 窗口，没有修改人工QA结果或写入审核PASS。

如只需要整页原始取景，可另运行 `node store-assets/screenshots/capture.mjs zh-CN` 或 `node store-assets/screenshots/capture.mjs en`。该旧工具输出到 `.test-artifacts/store-captures/<language>/`，不会直接生成正式排版文件。

正式图片准备后执行 `node scripts/check-screenshots.mjs`。缺图、空图、非 PNG、尺寸不符、超过 5 MiB 或混入额外文件都会拒绝。准备阶段可运行 `node scripts/check-screenshots.mjs --allow-pending` 记录缺图，但此结果不能代替正式检查，更不能代替视觉审核。

人工审核：1280×800 下文字清晰、按钮与对话框完整、构图可读、状态和数据真实、无商业数据、无虚构评价/下载量/五星/性能数字或 Microsoft 背书。不要使用 Microsoft、Edge、Excel 官方 Logo 作为品牌或暗示关联。截图静态校验通过后仍为 **MANUAL REVIEW REQUIRED**。
