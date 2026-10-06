# TableFlow 商店素材

此目录是 v0.5.1 RC 的提交准备稿，没有登录 Partner Center、上传或提交。`listing-zh-CN.md` 和 `listing-en.md` 只描述现有能力和已知边界；正式发布还需要真人 QA 与发布者核对。

官方规格核对日期：2026-10-06。[Edge 发布指南](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) 允许每语言最多 7 个 search terms，总计最多 21 words，单项最多 30 字符。中文关键词为 6 项，英文为 5 项、10 个按空格分隔的词；最终须核对 Partner Center 自身计数。词条在 `search-terms-zh-CN.txt`、`search-terms-en.txt`，每行一个，没有承诺所有网站或自动分页。

截图建议5张，目录在 `screenshots/zh-CN/` 和 `screenshots/en/`。当前两种语言各5张1280×800候选已自动生成，技术检查PASS，视觉状态仍为 **MANUAL REVIEW REQUIRED**。可复现工具 `screenshots/compose.mjs` 用未重绘的实际390×580扩展画面和现有合成页做本地静态排版；原图与记录在 `.test-artifacts/store-compositions/`。使用 `scripts/check-screenshots.mjs` 校验文件后仍须人工挑选和审核，第03张只有真实复制成功反馈，没有伪造 Excel。详情见 `screenshots/PLAN.md`。

商店 Logo 在 `logo-300.png`，为 300×300 PNG，使用与扩展图标一致的原创表格与流动箭头设计。此尺寸由原始绘制生成，没有把128px截图直接放大。小推广图 440×280 和大推广图1400×560 PNG 为可选；尚未制作时不能声明已完成。

提交入口资料：`CERTIFICATION_NOTES.md`、`PARTNER_CENTER_CHECKLIST.md`；另参考根目录 `STORE_PRIVACY_CHECKLIST.md`、`MANUAL_RELEASE_CHECKLIST.md`。隐私 URL、真实联系邮箱、账号和发布权利均需发布者确认。所有 Partner Center 字段初始为待人工完成。
