# Edge Add-ons 提交材料入口

当前阶段为 v0.5.1 RC。没有上传或提交审核；工程验收通过不表示已获商店批准。

发布者操作清单统一维护在 [PARTNER_CENTER_CHECKLIST.md](PARTNER_CENTER_CHECKLIST.md)，所有初始项目均为待人工完成。不要同时维护两份互相矛盾的勾选结果。

提交前先完成根目录 `MANUAL_RELEASE_CHECKLIST.md` 与 `manual-qa/result.json` 中真实 Edge Stable、Excel、Windows 缩放、截图、隐私 URL 和发布者复核。自动化结果查 `RELEASE_CANDIDATE_REPORT.md`，无需真人重复自动测试。只有 `npm run release:final` 的全部 guard 通过，才上传正式 `tableflow-edge-v0.5.1.zip`，不能误传 `-rc.zip` 或本机授权测试副本。

素材见两种 listing、两种 search terms、`logo-300.png`、`screenshots/PLAN.md`、`CERTIFICATION_NOTES.md`；提交表单隐私答复见根目录 `STORE_PRIVACY_CHECKLIST.md`。实际隐私站点部署状态与匿名 URL 验证见 `SITE_DEPLOYMENT.md` 和最终 RC 报告。截图建议5张1280×800，原始候选不是正式已审素材；推广图可选。

官方流程：[Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)。由发布者检查最终商店预览并主动提交，审核结论由微软决定。
