# 真实组件实验室

所有框架依赖仅安装到此独立 package，精确版本及 lockfile 不进入扩展生产依赖。

| Package | Version |
| --- | --- |
| antd | 6.6.5 |
| element-plus | 2.14.7 |
| @mui/x-data-grid | 9.14.0 |
| ag-grid-community / ag-grid-react | 36.2.0 |
| React / React DOM | 19.3.0 |
| Vue | 3.5.43 |

在此目录 npm install 后 npm run dev，监听 http://localhost:4175。查询参数 family 和 case 只控制测试应用的场景，生产提取器不得依赖这些参数。

scenarios.json 共 44 个命名场景。M6 验证实际 Community API 没有 pinning，并明确记录 Pro 能力未测试，不能写为 pinning PASS。MUI Community 分页始终启用，每页最多 100 条，因此 M10 的 10000 条仅采当前页。

tests/expected/real 为手工独立期望，不能由 extractor 自动更新。水平虚拟列 golden 保存完整已知业务矩阵，验收当前 DOM 中的实际单元格和明确缺列警告，不要求扩展伪造缺失列。

G11 将增长列设为 hidden。AG Grid 36.2.0 的语义 grid 仍声明 aria-colcount=5，而实际 DOM 为 4 列。仅凭 DOM 无法区分有意隐藏和虚拟化未渲染，因此保留 4 列真实业务矩阵，并期望 possibly-incomplete、COLUMN_COUNT_MISMATCH 和 POSSIBLY_INCOMPLETE；不会声称隐藏列已经读取。

组件 mount / firstDataRendered 后才发出 data-lab-ready；测试同时等待实际表格 DOM。侧效应断言比较滚动、焦点、勾选、展开、排序及筛选状态；不会点击分页或提交表单。
