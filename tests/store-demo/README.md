# 商店合成业务演示

运行 `npm run dev` 后访问 http://localhost:5173/tests/store-demo/index.html。表格、日期、商品和金额全部由本地固定规则生成，不使用真实用户数据和外部资源。

- index.html：18条完整原生订单表。
- pagination.html：原生表真实分页，每页20条/共120条，声明总行数；不是模拟Ant/Element组件。只期待范围差异警告，不声称专用current-page检测。该能力使用真正官方组件实验室验收。
- virtual.html：实际滚动复用16个DOM行，声明10000条，适合风险提醒和取消验收。没有网络接口或后台抓取。

截图脚本位于 store-assets/screenshots/capture.mjs。它捕获真实页面和正式Popup源码，只写原始素材到.test-artifacts。未执行真实Excel粘贴时，不生成假Excel窗口。
