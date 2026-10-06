# TableFlow v0.5.1 真实组件兼容性

生成时间：2026-10-06T10:03:33.642Z。仅在完整 npm run verify 成功后生成。

本轮 346 项单元测试与 93 项 Playwright 测试全部通过，0 失败、0 跳过。44 个真实组件场景，其中 43 个执行真实组件 DOM 提取；商业版能力声明不计为提取支持。正式支持结论仅适用于以下精确版本与场景，模拟 like fixture 不能替代这些证据。

组件安装在 tests/component-lab 独立 package 中，版本固定、lockfile 保留，生产扩展无 React/Vue/组件框架依赖。构建插件逐项检查实际生产 chunk 的模块图，另检查生产无网络 API、动态代码、远程脚本/配置及测试 URL 分支。

| Component | Exact Version | Scenario | Extraction | Completeness Detection | E2E | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| antd | 6.6.5 | A1 · Basic | PASS | complete | PASS | 3 行 / 5 列； |
| antd | 6.6.5 | A2 · Pagination 120 / 20 | PASS | current-page | PASS | 20 行 / 5 列；PAGINATION_DETECTED, ROW_COUNT_MISMATCH |
| antd | 6.6.5 | A3 · Fixed header | PASS | complete | ENGINE+SERIALIZERS | 60 行 / 5 列； |
| antd | 6.6.5 | A4 · Fixed left | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| antd | 6.6.5 | A5 · Fixed left and right | PASS | complete | PASS | 3 行 / 5 列； |
| antd | 6.6.5 | A6 · Horizontal scroll | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| antd | 6.6.5 | A7 · Row selection | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；CONTROL_COLUMNS_IGNORED |
| antd | 6.6.5 | A8 · Expanded row | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；CONTROL_COLUMNS_IGNORED |
| antd | 6.6.5 | A9 · Grouped headers | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| antd | 6.6.5 | A10 · Summary | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| antd | 6.6.5 | A11 · Empty | PASS | empty | ENGINE | 0 行 / 0 列； |
| antd | 6.6.5 | A12 · Chinese formats | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| element-plus | 2.14.7 | E1 · Basic | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| element-plus | 2.14.7 | E2 · Fixed left | PASS | complete | PASS | 3 行 / 5 列； |
| element-plus | 2.14.7 | E3 · Fixed right | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| element-plus | 2.14.7 | E4 · Selection | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；CONTROL_COLUMNS_IGNORED |
| element-plus | 2.14.7 | E5 · Expanded row | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；CONTROL_COLUMNS_IGNORED |
| element-plus | 2.14.7 | E6 · Grouped headers | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| element-plus | 2.14.7 | E7 · Summary | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| element-plus | 2.14.7 | E8 · Sortable | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| element-plus | 2.14.7 | E9 · Horizontal scroll | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| element-plus | 2.14.7 | E10 · Pagination 120 / 20 | PASS | current-page | ENGINE+SERIALIZERS | 20 行 / 5 列；PAGINATION_DETECTED, ROW_COUNT_MISMATCH |
| element-plus | 2.14.7 | E11 · Chinese formats | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| mui | 9.14.0 | M1 · Basic | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；PAGINATION_DETECTED |
| mui | 9.14.0 | M2 · Pagination 120 / 20 | PASS | current-page | ENGINE+SERIALIZERS | 20 行 / 5 列；PAGINATION_DETECTED, ROW_COUNT_MISMATCH, VIRTUALIZATION_DETECTED |
| mui | 9.14.0 | M3 · Virtual rows | PASS | complete | PASS | 80 行 / 3 列；PAGINATION_DETECTED, VIRTUALIZATION_DETECTED |
| mui | 9.14.0 | M4 · Horizontal virtual columns | PASS | possibly-incomplete | ENGINE+SERIALIZERS | 3 行 / 5 列；PAGINATION_DETECTED, COLUMN_COUNT_MISMATCH, POSSIBLY_INCOMPLETE |
| mui | 9.14.0 | M5 · Checkbox selection | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；PAGINATION_DETECTED, CONTROL_COLUMNS_IGNORED |
| mui | 9.14.0 | M6 · Community pinning unavailable | NOT TESTED / PRO ONLY | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；PAGINATION_DETECTED |
| mui | 9.14.0 | M7 · Sorting | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；PAGINATION_DETECTED |
| mui | 9.14.0 | M8 · Filtering | PASS | complete | ENGINE+SERIALIZERS | 1 行 / 5 列；PAGINATION_DETECTED |
| mui | 9.14.0 | M9 · Chinese | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列；PAGINATION_DETECTED |
| mui | 9.14.0 | M10 · 10000 rows, current page | PASS | current-page | ENGINE+SERIALIZERS | 100 行 / 3 列；PAGINATION_DETECTED, ROW_COUNT_MISMATCH, VIRTUALIZATION_DETECTED |
| ag-grid | 36.2.0 | G1 · Basic | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| ag-grid | 36.2.0 | G2 · Virtual rows | PASS | complete | PASS | 120 行 / 3 列；VIRTUALIZATION_DETECTED |
| ag-grid | 36.2.0 | G3 · 1000 rows | PASS | complete | ENGINE+SERIALIZERS | 1000 行 / 3 列；VIRTUALIZATION_DETECTED |
| ag-grid | 36.2.0 | G4 · Horizontal virtual columns | PASS | possibly-incomplete | PASS | 3 行 / 5 列；COLUMN_COUNT_MISMATCH, POSSIBLY_INCOMPLETE |
| ag-grid | 36.2.0 | G5 · Pinned left | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| ag-grid | 36.2.0 | G6 · Pinned right | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| ag-grid | 36.2.0 | G7 · Sorting | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| ag-grid | 36.2.0 | G8 · Filtering | PASS | complete | ENGINE+SERIALIZERS | 1 行 / 5 列； |
| ag-grid | 36.2.0 | G9 · Chinese | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| ag-grid | 36.2.0 | G10 · Cell renderer | PASS | complete | ENGINE+SERIALIZERS | 3 行 / 5 列； |
| ag-grid | 36.2.0 | G11 · Hidden column | PASS | possibly-incomplete | ENGINE+SERIALIZERS | 3 行 / 4 列；COLUMN_COUNT_MISMATCH, POSSIBLY_INCOMPLETE |

ENGINE+SERIALIZERS 表示真实 Chromium 已加载扩展、真实 DOM 的矩阵与手工 Golden 对比且 CSV/TSV 反向解析一致；PASS 另覆盖实际 Popup 选择、状态、warning、确认及剪贴板/Blob 下载。MUI Community 的 pinning 不伪装为支持，也没有安装 Pro/Premium/Enterprise。

## 完整性与证据

ExtractionDiagnostics 记录 complete、current-page、visible-only、possibly-incomplete、unknown，业务行数排除表头/汇总；实际列数以已渲染逻辑列为准。ARIA 声明、结构化分页总计/范围、行列索引、测量滚动容器和适配器事实形成 evidence，不把任意年份或页面数字当总数。完整状态说明“根据当前页面结构未检测到缺失数据”，不作绝对保证。

当前页可直接导出，并明确当前范围及可读取总数。风险状态先确认再导出实际已读矩阵；无效结构、提取失败和过期快照不可伪装成正常 CSV。虚拟收集有时间、行数、迭代与无进展上限，检测身份/列宽变化、缺口和中途卸载，恢复滚动及可恢复的焦点，不触发排序、过滤、分页、选择、展开或提交。

warning codes：PAGINATION_DETECTED、VIRTUALIZATION_DETECTED、ROW_COUNT_MISMATCH、COLUMN_COUNT_MISMATCH、VISIBLE_ROWS_ONLY、POSSIBLY_INCOMPLETE、LOW_CONFIDENCE、CROSS_ORIGIN_FRAME、CLOSED_SHADOW_ROOT、FIXED_COLUMN_CLONES_REMOVED、CONTROL_COLUMNS_IGNORED、UNKNOWN_GRID_STRUCTURE、LOADING、EXTRACTION_FAILED、COLLECTION_ABORTED、COLLECTION_LIMIT。

## 真实组件性能（本机毫秒）

| Component | 数据行 | detect | extract | diagnostics | CSV | TSV | 虚拟收集 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| antd | 1000 | 11.20 | 231.40 | 16.80 | 1.70 | 1.30 | — |
| antd | 5000 | 70.30 | 1441.90 | 181.60 | 6.20 | 4.50 | — |
| ag-grid | 10000 | 0.80 | 4.40 | 0.80 | 0.30 | 0.10 | 1982 ms / 210 行 / visible-only |

计时是一次验收样本，不设不现实的绝对 SLA。虚拟 10000 行的 detect/extract/diagnostics/CSV/TSV 计时针对初始已渲染窗口（9 条业务行），不代表全量 10000 行提取；虚拟收集单独报告实际收集行数、耗时和受配置上限影响的部分状态，不能伪造完整数据或无限滚动。

## 验收范围与隐私

Chrome headless 工具栏弹窗不能作为 Playwright Page 操作；UI 用同一原始 Popup 页面在扩展标签页执行并保留业务页 active。结构测试副本只增加 localhost 授权；原始生产 manifest 另外真实加载验证，生产文件未增加 host 权限。实际剪贴板和下载内容经过验证，Edge 原生权限提示与 Excel 实际粘贴未自动化。

生产权限仍为 activeTab、scripting、storage；optional host 仅为用户主动开启的网站图标，未增加任何生产网络请求。本轮记录 1183 个本机实验室/扩展资源请求，外部请求 0，记录不监控浏览器其他进程流量。

行为迁移：按本阶段明确要求，默认去除纯控制列。手工更正模拟 Golden 06 的 checkbox 空列和 07 的 checkbox/展开空列，保留全部业务值及顺序；没有用自动生成期望或跳过断言掩盖差异。

用户可在帮助中主动生成本地诊断 JSON，严格白名单包含版本、浏览器、无路径/query/token/凭据的 origin、提取器、诊断与结构计数；不包含业务文本/HTML、列名、cookie、storage、表单值或行键。性能/序列化回归工具另建显式测试 bundle，不暴露在正式生产扫描器中；结构快照工具也仅存在于开发 bundle。

真实 AG Grid G11 隐藏列场景的业务矩阵为正确的 4 列，DOM 却仍声明 aria-colcount=5。不能仅凭该证据区分主动隐藏和未渲染列，因此保守显示 possibly-incomplete 与 COLUMN_COUNT_MISMATCH，而不冒充完整。只手工调整该场景的诊断期望，业务值及顺序未变。

下一阶段建议：收集脱敏真实 DOM 建立版本差异回归；提升虚拟收集进度与缺口定位；明确范围后设计声明式站点规则。当前阶段没有用户 JavaScript、站点 adapter、远程配置或执行任意代码。
