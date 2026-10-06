# TableFlow 兼容性实验室

20 个独立 HTML fixture 模拟常见表格 DOM，每个页面有一份固定 JSON 输出，位于 `tests/expected/`。页面不依赖 React、Vue 或第三方 grid 包；测试数据全部本地合成。

通过 `index.html` 可逐页人工查看。自动验收应在实际 Chromium 中加载扩展，比较候选类型、完整矩阵、列数、表头行数及完整性；不要只在 jsdom 中调用函数。

## Golden 约定

```json
{
  "tables": [
    {
      "type": "native-table",
      "rows": [["字段", "值"], ["示例", "1"]],
      "columns": 2,
      "headerRows": 1,
      "complete": true
    }
  ],
  "diagnostics": [{"code": "CROSS_ORIGIN_FRAME_PERMISSION"}]
}
```

- 行列值按合并区域左上角保留、其他位置补空的规则人工审阅。
- 不保存运行时 id、时间戳或 DOM 引用。
- 诊断列表表示必须出现的诊断；可以附加真实的其他诊断。
- `complete` 表示当前页面已提供的表格数据完整，不表示分页系统的所有页均被读取。
- Generic div 的表头行提供 `data-header="true"`；重复结构和真实浏览器几何对齐支持表格识别。
- Framework fixture 保留空 selection / expand 列；带明确 expanded-row 标记的说明区域不是数据行。
- Golden 不能由 extractor 输出自动重写；改变它必须先确认语义并人工审阅。

## 平台边界

`10-shadow-dom.html` 同时含 open 与 closed host。Open root 有可读取原生表格；closed root 的内部内容不允许读取。标准 DOM 无法证明未知 host 是否有 closed root，所以结构化不透明 host 的 `CLOSED_SHADOW_ROOT` 诊断必须标为 `certainty: "possible"`，不能宣称已经读到内部数据。

`11-same-origin-iframe.html` 使用同目录 `frame-child.html`，以及 `http://localhost:4174/tests/fixtures/frame-child.html` 跨源 frame。E2E 主服务器默认 4173、次服务器 4174；不同端口就是不同来源，不为访问跨源内容增加权限。

## 动态与性能 fixture

`12-virtual-scroll.html` 固定复用 20 个 DOM 行节点，滚动后异步更新，完整数据为 120 条加 1 行表头。12 条合法重复数据具有不同 aria 行索引和 row key。Golden 包含全部 121 行，不能按文字去重删掉重复数据。采集还必须恢复原始 scrollTop。

`19-large-table.html` 默认生成 100 条数据加 1 行表头，每行 20 列；通过 `?rows=1000` 或 `?rows=5000` 可测试其他数据规模。默认 Golden 固定为 101 × 20。测试页面使用查询参数生成测试规模；生产提取器不能读取 fixture 文件名或参数来选择识别策略。
