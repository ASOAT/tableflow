# TableFlow v0.5.0 Beta 发布报告

验收日期：2026-10-06。结论：**NOT READY**。工程构建、回归和真实 ZIP 验收已通过；尚不能作为已完成 Edge Add-ons 提交准备的版本。没有发布隐私网站、上传或提交商店，也没有新增登录、收费、AI、服务器或远程执行能力。

## 1. 本轮新增内容

- 面向办公用户的简体中文/英文 Popup、正式 manifest 本地化、首次说明、本地语言偏好和帮助入口。
- 完整、当前页、仅当前可见、可能不完整、无法判断五种提示；技术代码放入折叠详情。完整表示当前结构未检测到缺失，不保证网站源数据全部可读。
- 最多5行8列的预览与同一已读取矩阵导出；风险确认含当前行列和可信声明数量，当前页直接导出。成功提示行列数量。
- 页面、文档、源表和内容有效性校验；过期快照阻止导出并要求重新扫描。虚拟采集显示实际行数、支持取消并恢复滚动，取消结果不能直接导出。
- 区分无表格、加载中、访问受限与提取失败；本地复制/下载诊断 JSON，不含业务单元格、完整HTML、输入值或存储内容，分享前需检查来源域名。
- 独立开发结构快照工具：默认脱敏，严格属性/class白名单、敏感属性排除、5000节点/40层限制；开发工具不进入生产包。
- 原创16/32/48/128 PNG图标，纯静态隐私页、披露清单、双语listing、6场景截图计划、推广图规格和合成业务演示页。
- 发布检查与ZIP打包/解压/字节一致性检查/真实扩展smoke，保留纯原生界面和现有提取层。没有改动提取器或固定期望JSON。

## 2–4. 自动验收与测试数

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 开发前v0.4.0基线 verify | PASS：217单元 + 80浏览器 = 297 | 先成功验收，再捕获 `.test-artifacts/phase3-baseline` |
| 最终 `npm run verify` | PASS，exit 0 | 类型、实验室类型、lint、测试策略、全部测试、生产构建、报告 |
| `npm run release:check` | PASS，exit 0，包含再次完整verify | `.test-artifacts/release-check.json`；检查时间2026-10-06T09:09:36.458Z |
| `npm run package` | PASS，exit 0 | `.test-artifacts/package-results.json` |
| 解压ZIP extension smoke | PASS，exit 0 | `.test-artifacts/package-smoke.json` |
| 单元测试 | 275 passed / 0 failed / 0 skipped | `.test-artifacts/unit-results.json` |
| 真实Chromium扩展E2E | 93 passed / 0 failed / 0 skipped / 0 flaky | `.test-artifacts/e2e-results.json` |
| 合计 | **368 passed / 0 failed / 0 skipped** | 比297基线新增71项；不把独立smoke/截图混入此总数 |
| 合成商店演示页 | 3/3 PASS | `.test-artifacts/store-demo-results.json`；普通18×6、分页20×6/120、虚拟16×6/10000 |

保留全部旧测试和业务矩阵/诊断/隐私断言，禁止skip/only/todo。旧UI断言仅适配本地化名称、保守提示文案和技术详情展开；没有删测试、自动更新Golden或降低性能阈值。44个真实组件场景中的MUI Community商业版pinning仍仅记录未测试，不冒充支持。

## 5–6. 商店ZIP

- 文件：`E:\Project\OpenSource\SaaS\tableflow\release\tableflow-edge-v0.5.0.zip`。
- 大小：**64,983字节，约63.46 KiB**。
- SHA-256：`234be158dbb12b828844fdad14a056ab5402d362a1d49556dc38dacbf950090d`。
- ZIP根目录直接包含manifest.json，版本0.5.0，共14个生产文件。没有src/tests/node_modules/.env/git/测试素材/source map/开发工具。
- 解压路径：`.test-artifacts/packages/unpacked-4fPCGR`。检查所有manifest和Popup引用、图标尺寸、两种本地化键，以及所有14文件SHA-256与dist完全一致。
- 两个真实MV3上下文：原始ZIP清单加载并验证首次说明/帮助/隐私；仅测试副本增加loopback授权，实际复制TSV、下载带BOM CSV，并独立反解析严格比较行列和单元格。Windows剪贴板CRLF仅按等价换行比较；CSV内容独立精确检查。
- 浏览器实测未暴露benchmark、serialize或structural开发API；没有自动操纵Edge原生工具栏或权限弹窗，也未运行真实Excel。

## 7–8. 权限、网络与数据

必需权限保持 **activeTab、scripting、storage**。无必需host_permissions、all_urls、tabs、history、cookies、webRequest、downloads、clipboardRead/Write。optional_host_permissions保留HTTP/HTTPS声明，仅用户开启某个网站图标时逐网站申请；安装不会获得全网站访问权。

生产没有网络API、远程代码、analytics、telemetry或服务器；CSP connect-src none。受控回归记录1183次扩展/本机测试资源请求，**外部请求0**；ZIP smoke外部请求也为0。公开网站自身请求不属于扩展上传，此结果不代表监测了所有浏览器进程流量。

表格仅在运行内存中处理；storage.local保存autoIconSites、onboardingSeen和uiLanguage。剪贴板、CSV及用户主动诊断JSON属于本地输出，由用户管理。

## 9. 国际化

Popup统一i18n层支持zh-CN/en；manifest使用官方`_locales/zh_CN`与`_locales/en`结构，default_locale为zh_CN。中文产品名为“TableFlow - 网页表格导出助手”，英文为TableFlow。语言切换保存本地且不重新抓取替换预览数据。两种语言静态标签、可访问名称及窄布局自动验收通过。

## 10. Accessibility与尺寸

自动检查真实键盘Enter/Space激活、Tab/Shift+Tab焦点循环、Escape关闭与焦点归还、可见focus、dialog标签、状态文字和live region。测试长表名、24列、10000行标签、zh-CN/en以及1/1.25/1.5设备比例下的窄CSS视口；页面无横向溢出，预览自身可横向滚动，主要按钮在可见宽度内。

设备比例/视口模拟不能替代Windows系统缩放、真实Edge工具栏Popup或屏幕阅读器。DOM修改、SPA、刷新、切换业务tab和重新打开Popup有真实E2E；隔离世界重新加载的旧token失效由单元测试验证。原生Edge重载/卸载与系统朗读保留人工验收。

## 11. 真实公开页面Smoke

独立观察10个无需登录的公开页面：**7 PASS_SCOPE、1 PARTIAL_SCOPE、2限制**。每个可导出页面只选择一个候选，实际复制和下载与已读快照比较；没有在线全量源数据Golden，PASS_SCOPE不能当作整站完整性保证。

| 页面 | 结果 |
| --- | --- |
| W3C WAI 单表头、双表头、不规则表头、多级表头（4页） | 4 PASS_SCOPE |
| DataTables 基础与复杂表头（2页） | 2 PASS_SCOPE；仅本次DOM范围，不宣称专用分页识别支持 |
| Ant Design 官方Table文档 | 检测60候选；所选快照验证未通过，阻止导出，未把旧预览当成功 |
| Element Plus 官方Table文档 | 检测34候选；选中1个PASS_SCOPE |
| MUI官方DataGrid | 检测3候选；选中1个当前页PARTIAL_SCOPE |
| AG Grid官方Quick Start | HTTP202，未发现可读网格，NO_TABLES；未绕过访问/挑战 |

完整网址、日期、提取/诊断/导出和限制见 [REAL_WORLD_SMOKE_TEST.md](REAL_WORLD_SMOKE_TEST.md)。此观察不纳入确定性CI，也不扩大精确版本实验室的支持范围。

## 12–13. 隐私与商店素材

[PRIVACY_POLICY.md](PRIVACY_POLICY.md) 和 `docs/privacy.html` 已生成；后者为无JavaScript/第三方资源的静态页，亦包含在ZIP中。访问、内存处理、本地偏好、用户导出与对外传输分别说明。**没有在线发布，尚无可填写Partner Center的真实隐私URL**。[STORE_PRIVACY_CHECKLIST.md](STORE_PRIVACY_CHECKLIST.md) 按当前代码映射披露；不把“无上传”写成“无网页访问”。

`store-assets/`包含双语listing、6场景1280×800截图计划、可复现capture脚本、推广图440×280/1400×560说明和提交清单。合成demo与真实Popup复制/CSV/风险/隐私原始素材已生成到`.test-artifacts/store-captures/`，并完成初步视觉检查。原始扩展标签页画面存在大量留白，不作为正式商店素材；没有伪造Excel窗口。推广图为规格说明，尚无正式设计。listing中的发布者备注须提交前移除并填真实信息。

## 14. 已知限制

- 不支持全网保证、自定义未知网格、closed Shadow DOM、未授权跨域iframe、未加载服务端行或水平虚拟列的全量采集。
- 不自动翻页、登录、排序/过滤、展开业务行或抓取接口；分页仅当前已读取范围。没有显式结构证据的分页可能无法诊断，普通HTML完整状态仍只是当前结构判断。
- 多Demo或持续变化的页面可能使快照失效，需等待稳定后重新扫描；本轮Ant官方文档所选快照未完成导出，应作为兼容限制追踪。
- 虚拟采集受稳定索引/已知总数/时间/行数限制；取消或结构失败不可导出，部分结果需明确确认。
- Microsoft Excel自身的自动日期/数字转换、真实粘贴和中文CSV打开需人工确认。安装权限与原生Toolbar操作没有被测试副本授权替代。
- 选表高亮本轮按稳定性优先暂不实现；ZIP打包目前依赖Windows PowerShell。

## 15. 剩余人工验收

见 [MANUAL_RELEASE_CHECKLIST.md](MANUAL_RELEASE_CHECKLIST.md)：最终ZIP在真实Edge加载/工具栏/首次说明、网站权限拒绝与撤销、Excel粘贴和CSV打开、Windows125%/150%、卸载后刷新清理、Narrator、隐私URL/真实发布者信息、正式截图审核。已自动验证的矩阵、ZIP引用/内容、Chromium复制下载和键盘流程不重复要求人工代替。

## 16. 差异统计

当前目录没有Git仓库，不能伪造git status或提交。使用开发前通过297项测试后捕获的源快照，运行`git -c core.autocrlf=false diff --no-index --stat`。不包含依赖、dist、release、运行证据或缓存。完整结果见 [phase3-diff-stat.txt](.test-artifacts/phase3-diff-stat.txt)。

```text
75 files changed, 2457 insertions(+), 407 deletions(-)
```

## 17. 发布决策

**NOT READY**。明确阻断项：

1. 尚未发布并实际打开验证真实privacy URL；不得填写本地路径或虚构地址。
2. 最终ZIP在原生Microsoft Edge及真实Microsoft Excel的必要验收未执行，系统缩放/权限/卸载检查也尚未记录。
3. 正式商店截图尚未完成构图与真实性审核；当前只有计划、复现脚本与原始素材。
4. 发布者账号信息及最终商店字段/披露尚需本人核对；支持字段可选，若填写须真实可用。

两项公开页面限制已经披露，不冒充全部支持；Ant快照拒绝原因需继续实站跟踪。只有解决上述提交阻断项后才可以改为READY FOR BETA SUBMISSION。工程验收通过不等于微软审核批准。
