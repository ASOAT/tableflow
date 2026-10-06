# TableFlow 真实公开页面 Smoke Test

测试日期：2026-10-06T09:10:28.912Z。实际 dist 版本：0.5.0；content.js SHA-256：`e63e8b69424fec3cce52433d71bd5d5ce907da136c6a87b9248ccbbb0954e4d9`。

独立执行 `node scripts/smoke-world.mjs`，不纳入 verify，不把互联网访问失败变成生产构建失败。真实 Chromium 加载实际 dist 字节；测试副本仅授予下列明确站点origin，不改生产manifest、不模拟Chrome API。使用当前系统已有代理（若有），不登录、不绕过访问挑战、不抓取网站接口、不自动翻页。正式Popup路径从manifest动态读取。

检查实际DOM候选的矩阵形状和诊断，选择一个有效候选，通过真正Popup复制TSV及下载CSV，再独立反解析与已读快照比较。PARTIAL_SCOPE表示导出当前范围一致，但结构提示数据可能不完整；PASS_SCOPE也不能证明网站源数据全部完整。当前没有在线人工全量Golden。其他候选没有逐个导出。没有保存网页HTML或业务cell文本；JSON证据仅包含URL、类型、计数、诊断和错误摘要。公开网站自身的网络资源请求不等于扩展上传网页内容。

| Site | Page Type | Detected Tables | Extraction | Completeness Diagnosis | Export | Result | Notes | Test Date |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| [W3C WAI](https://www.w3.org/WAI/tutorials/tables/one-header/) | 原生单层表头 | 3 | 矩阵宽度/文本类型检查通过 | complete | 选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致 | PASS_SCOPE | 仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。 | 2026-10-06 |
| [W3C WAI](https://www.w3.org/WAI/tutorials/tables/two-headers/) | 行列双表头 | 2 | 矩阵宽度/文本类型检查通过 | complete | 选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致 | PASS_SCOPE | 仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。 | 2026-10-06 |
| [W3C WAI](https://www.w3.org/WAI/tutorials/tables/irregular/) | 不规则合并表头 | 2 | 矩阵宽度/文本类型检查通过 | complete | 选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致 | PASS_SCOPE | 仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。 | 2026-10-06 |
| [W3C WAI](https://www.w3.org/WAI/tutorials/tables/multi-level/) | 多级表头 | 4 | 矩阵宽度/文本类型检查通过 | complete | 选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致 | PASS_SCOPE | 仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。 | 2026-10-06 |
| [DataTables](https://datatables.net/examples/core/basic_init/zero_configuration.html) | 官方分页示例 | 1 | 矩阵宽度/文本类型检查通过 | complete | 选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致 | PASS_SCOPE | 仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。 | 2026-10-06 |
| [DataTables](https://datatables.net/examples/core/basic_init/complex_header.html) | 官方复杂表头示例 | 1 | 矩阵宽度/文本类型检查通过 | complete | 选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致 | PASS_SCOPE | 仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。 | 2026-10-06 |
| [Ant Design](https://ant.design/components/table/) | 官方Table文档与Demo | 60 | 矩阵宽度/文本类型检查通过 | current-page, complete, unknown | 未执行 | EXPORT_OR_ACCESS_FAILURE | page.waitForEvent: Timeout 8000ms exceeded while waiting for event "download" =========================== logs =========================== waiting for event "download" ==================================================== | 2026-10-06 |
| [Element Plus](https://element-plus.org/en-US/component/table.html) | 官方Table文档与Demo | 34 | 矩阵宽度/文本类型检查通过 | complete | 选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致 | PASS_SCOPE | 仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。 | 2026-10-06 |
| [MUI](https://mui.com/x/react-data-grid/) | 官方DataGrid Demo | 3 | 矩阵宽度/文本类型检查通过 | current-page, possibly-incomplete | 选中1个候选：实际TSV剪贴板+带BOM CSV反解析一致 | PARTIAL_SCOPE | 仅证明选中快照的导出一致；没有在线完整源数据Golden，不代表页面全部内容均支持。 | 2026-10-06 |
| [AG Grid](https://www.ag-grid.com/react-data-grid/getting-started/) | 官方React Quick Start | 0 | 未发现可导出候选 | 未执行 | 未执行 | NO_TABLES | 可能是访问挑战、尚未加载或当前公开DOM没有可读表格。 | 2026-10-06 |

结果统计：7 PASS_SCOPE，1 PARTIAL_SCOPE，2 访问/发现/导出限制。每页只执行有界普通浏览；页面随时可能变化。此观察不扩大 REAL_COMPONENT_COMPATIBILITY.md 的精确版本回归支持范围。
