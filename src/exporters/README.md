输入统一使用 `src/shared/table.ts` 的 `TableMatrix`。

- `delimited.ts`：纯数据序列化，不访问 DOM 或浏览器 API。`toTsv` 使用制表符分列、CRLF 分行，并引用包含制表符、双引号或换行的单元格；`toCsv` 处理逗号、双引号和换行转义，返回含 UTF-8 BOM 标记的文本。
- `clipboard.ts`：复制必须从用户点击处理函数直接调用。优先写入 `text/plain` TSV 与安全生成的 `text/html` 表格，让 Excel 保留单元格边界和单元格内换行；失败时退回纯文本写入，再退回临时文本框 / 可编辑选区复制。

HTML 表格通过 DOM 元素和文本节点生成，不把单元格内容当作 HTML 解析。临时选区在复制后删除，不读取剪贴板。复制使用用户操作，不申请 `clipboardRead` / `clipboardWrite` 权限。

CSV 文本由 Popup 用 UTF-8 Blob 和本地下载链接导出，不需要 `downloads` 权限。
