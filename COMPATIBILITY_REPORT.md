# TableFlow v0.5.1 兼容性验收报告

生成时间：2026-10-06T11:06:25.848Z。本报告仅在完整 `npm run verify` 成功后生成，期望 JSON 不由提取器生成或更新。

## 自动验收结果

| 项目 | 总数 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: | ---: |
| 单元测试 | 346 | 346 | 0 | 0 |
| 真实 Chromium 扩展 E2E | 93 | 93 | 0 | 0 |
| 合计 | 439 | 439 | 0 | 0 |

类型检查、ESLint、生产构建与产物检查全部通过。20 个独立 HTML fixture 对照手工固定 golden JSON，逐个比较完整矩阵、表头、列数、完整性和诊断。CSV/TSV 使用独立解析器反向验证；中文、逗号、引号、换行、空格和空单元格均覆盖。固定种子额外生成 50 组 native 与 30 组 ARIA DOM；也验证恶意跨度/索引边界。

E2E 使用真实 Chromium persistent context、真实 MV3 后台和 chrome.scripting 隔离世界，不 mock Chrome API。结构测试副本仅添加 http://localhost/* 测试授权以替代工具栏手势/原生授权提示，生产 dist 未改变，且另外实际加载原始 production dist 校验权限。实际 Popup 源码通过扩展标签页运行；只对扩展自身的前台弹窗保留已扫描业务页，切换到其他网页会阻止旧快照导出。实际点击复制后读取剪贴板矩阵并验收 Blob 下载文件。序列化/性能测试工具由显式开发入口单独加载，不存在于生产包。浏览器测试没有自动操作 Edge 原生授权弹窗，也未实际打开 Excel。

图标设置测试实际点击启用开关，再通过真实 storage 事件关闭网站，严格验证 UI 开关、图标与注册脚本清理。测试副本的必需 localhost 授权无法撤销；生产可选授权的关闭流程由单元测试覆盖，原生权限提示/撤销需 Edge 人工验收。没有跳过测试或删除矩阵/诊断/隐私断言。v0.4 的纯控制列 Golden 调整属于上一阶段；v0.5 不改提取器或 Golden，仅适配本地化名称、保守文案和详情展开操作。

## 支持状态

| 能力 | 状态 | 已验证范围与限制 |
| --- | --- | --- |
| Native table | PASS | th/td、行组、多层表头、rowspan/colspan、tfoot、嵌套文本、隐藏噪音、空表、畸形 DOM |
| ARIA table/grid/treegrid | PASS | role 行/单元格、索引排序与分片合并；缺行缺列会诊断，确认后可导出已读部分；结构冲突禁止导出 |
| 通用 div grid | PARTIAL | 重复行结构、密度、可测几何对齐；启发式可能误判，低置信度默认隐藏 |
| Ant Design | PARTIAL | 真实官方版本与场景见 REAL_COMPONENT_COMPATIBILITY.md；不承诺所有版本 |
| Element Plus | PARTIAL | 真实官方版本与场景见 REAL_COMPONENT_COMPATIBILITY.md；不承诺所有版本 |
| MUI DataGrid | PARTIAL | 已渲染 ARIA 结构与逻辑索引；无总数或不完整列无法保证全量 |
| AG Grid | PARTIAL | center/pinned 依稳定行列标识合并；缺键、冲突和未渲染列拒绝完整导出 |
| EasyUI/jqGrid | PARTIAL | 保留已有拆分 HTML 表格规则；复杂自定义布局需实站验证 |
| Open Shadow DOM | PASS | 递归开放根及其表格 |
| Closed Shadow DOM | UNSUPPORTED | 标准 API 无法访问；不透明的声明网格仅报 possible CLOSED_SHADOW_ROOT，不能确认 closed 模式 |
| 同源 iframe | PASS | 递归读取可访问且就绪的内嵌文档 |
| 跨域 iframe | UNSUPPORTED | CROSS_ORIGIN_FRAME_PERMISSION；不自动扩展授权或绕过同源限制 |
| 虚拟行滚动 | PARTIAL | 20 DOM slots 收集 120 数据行，保留合法重复值并恢复位置；仅有稳定索引/键、已知总数、可验证纵向容器时可判定完整 |
| 分页 | CURRENT_PAGE | 检测结构化分页证据，只导出当前页，不自动翻页 |
| 水平虚拟列 / 未加载服务端数据 | PARTIAL / UNSUPPORTED | 已读列可确认后导出，不水平采集、不抓取接口、不虚构完整结果 |

PASS 表示本仓库固定结构验收通过，不代表所有网站通用。截图中的浙江大学登录门户没有在本轮直接访问，无法依据截图确认其 DOM 或实站兼容性。

## 性能（实际浏览器，毫秒）

| 数据行 × 列 | detect | extract | CSV | TSV |
| --- | ---: | ---: | ---: | ---: |
| 100 × 20 | 2.00 | 11.10 | 0.40 | 0.20 |
| 1000 × 20 | 10.60 | 96.40 | 1.80 | 1.40 |
| 5000 × 20 | 55.40 | 595.80 | 7.40 | 6.80 |

行数统计不包含表头，输出矩阵含一行表头。1000 × 20 提取要求低于 2000 ms；没有用降低断言或跳过测试取得通过。计时是本机一次验收结果，受设备和页面样式影响。

## 权限、网络和数据

必需权限：activeTab、scripting、storage。没有必需 host_permissions、all_urls、tabs、downloads、clipboardRead/Write。optional_host_permissions 仅用于用户自行启用当前网站的复制图标；关闭会撤销该网站授权。storage.local 保存 autoIconSites、onboardingSeen、uiLanguage，不保存表格。

产品无 fetch/XHR、遥测、服务端或上传逻辑。CSV 是本地 Blob，复制由用户点击触发。本轮浏览器 context 记录 1183 次本机 fixture/扩展资源请求，外部请求 0 次；外部请求断言不允许放宽。E2E 本机 fixture HTTP 服务、测试依赖/官方浏览器安装下载属于开发验收，不是扩展产品服务或网页上传。页面自身和浏览器内部的其他网络行为不受扩展控制，该记录不等于监控所有浏览器进程流量。

## 已知限制与后续

尚未自动验证 Edge 网站授权原生对话框、登录业务站和 Excel 实际粘贴。未知网格结构、异步超时、达到行/迭代上限、稳定键冲突、无已知总数时报告风险状态；用户确认后仅导出已读数据。结构错误或过期快照禁止导出。Closed shadow 的检测存在标准 API 限制，只能有条件给出可能性诊断。

发布决策见 BETA_RELEASE_REPORT.md；真实公开页面观察见 REAL_WORLD_SMOKE_TEST.md；尚需人工确认的 Edge、Excel、系统缩放及隐私页面发布见 MANUAL_RELEASE_CHECKLIST.md。本轮不发布网站、不提交商店、不增加自定义用户脚本或远程适配器。
