# TableFlow 静态隐私站点

站点发布目录是 `site/`，只包含 HTML 和 `.nojekyll`；不需要业务服务器、构建步骤、JavaScript、第三方字体、analytics、cookie 或广告。主页为 `site/index.html`，隐私页为 `site/privacy/index.html`。站点使用相对链接，支持 GitHub Pages 的项目子路径，不绑定未确定的正式域名。

`PRIVACY_POLICY.md` 是政策正文，`site/privacy/index.html` 与 `docs/privacy.html` 内容完全相同。修改政策时同步三份文件并运行 `npx vitest run tests/privacy-site.test.ts`。`docs/privacy.html` 会进入扩展发布包，`site/` 只用于静态网站，不能放入扩展 ZIP。

## 本地预览

已安装项目依赖时，在项目目录执行：

```powershell
npm run site:preview
```

用浏览器打开命令显示的本机地址，检查主页和隐私链接。也可直接打开 `site/privacy/index.html` 查看隐私正文。本机预览只用于开发，不是可提交的 Privacy URL。

## GitHub Pages 发布

本次用户明确要求使用 GitHub Pages。仓库默认分支的 Pages 工作流只上传 `site/`，不发布扩展源码、测试页面、手工 QA 结果或开发产物。GitHub 仓库的 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。在 Actions 确认部署成功，然后以 Pages 显示的实际 HTTPS 地址为准。

项目站点通常有仓库名子路径；保留这个子路径，在首页地址后加 `privacy/` 得到隐私页。不要把示例域名、未解析的变量、本地文件路径或本机地址填进商店。不要添加包含未确认域名的 `CNAME`。如以后换到其他静态托管，只部署 `site/` 并保留目录结构。

GitHub Pages 网站面向公众，不要求访问者登录。部署权限只用于仓库维护者操作。GitHub 官方说明：Pages 为安全记录访问者 IP；这已在隐私政策中单独披露，与扩展不上传表格内容的声明分开。

当前部署结果及实际 URL 以 `RELEASE_CANDIDATE_REPORT.md` 的验收记录为准。配置存在、构建成功或仓库存在都不能代替匿名访问验证。

2026-10-06 实际发布：仓库 https://github.com/ASOAT/tableflow ，主页 https://asoat.github.io/tableflow/ ，隐私政策 https://asoat.github.io/tableflow/privacy/ 。Pages工作流已成功，后者经 `npm run check:privacy` 匿名HTTPS HTML 200检查通过。公开联系邮箱仍是发布前必填项，不因此改为已审核。

## 上线检查与填写位置

1. 在 Edge InPrivate 窗口中打开实际主页和隐私页，确认 HTTPS、正常正文、无需登录或其他认证。不能使用依赖本机地址的资源。
2. 执行 `npm run check:privacy -- <真实的 HTTPS 隐私 URL>`。保存实际执行结果；该网络检查独立于常规 `verify`。它检查 HTTPS、HTTP 200、HTML、TableFlow/Privacy 正文和明显本机地址，但不能自动批准政策内容。
3. 把最终 URL 填入 Microsoft Partner Center 的 **Privacy → Privacy Policy URL**，并在 `manual-qa/result.json` 的隐私项目和发布报告记录对应 URL、检查日期及真实结果。`store-assets/PARTNER_CENTER_CHECKLIST.md` 保留人工确认项。
4. 在正式提交前填写政策中的 `[REQUIRED BEFORE RELEASE]` 公开联系邮箱，同步政策文件并重新部署；再检查公开页面包含最新内容。尚未填写联系方式时不得声称已完成发布者审核。
5. 再次使用匿名窗口检查最终 URL；访问无需登录，返回正文而不是仓库浏览页、404、重定向到认证页或开发服务器。

GitHub 部署可完成静态 Privacy URL 发布，不代表已完成 Edge 商店提交、政策法律审核或真实 Edge/Excel 人工验收。

官方参考：[GitHub Pages 发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[GitHub Pages 数据收集](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)、[Edge 提交与隐私字段](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)。
