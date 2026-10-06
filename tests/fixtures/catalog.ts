/** Independent browser fixtures and manually reviewed, immutable golden outputs. */
export interface FixtureCase {
  file: string;
  expectedFile: string;
  label: string;
}

export const fixtures: readonly FixtureCase[] = [
  { file: '01-native-table.html', expectedFile: '01-native-table.json', label: '原生表格、thead / tbody / tfoot' },
  { file: '02-rowspan-colspan.html', expectedFile: '02-rowspan-colspan.json', label: 'rowspan / colspan 规则展开' },
  { file: '03-multi-header.html', expectedFile: '03-multi-header.json', label: '三层复杂表头' },
  { file: '04-aria-grid.html', expectedFile: '04-aria-grid.json', label: 'ARIA grid / table / treegrid 与行列索引' },
  { file: '05-div-grid.html', expectedFile: '05-div-grid.json', label: '无框架类名的重复 div 几何行' },
  { file: '06-ant-design-like.html', expectedFile: '06-ant-design-like.json', label: 'Ant 风格固定表头、固定 clone、selection、展开与summary' },
  { file: '07-element-plus-like.html', expectedFile: '07-element-plus-like.json', label: 'Element 多层表头、selection、expand、fixed与summary' },
  { file: '08-mui-grid-like.html', expectedFile: '08-mui-grid-like.json', label: 'MUI 角色结构与错序索引' },
  { file: '09-ag-grid-like.html', expectedFile: '09-ag-grid-like.json', label: 'AG Grid center / pinned 行列身份去重' },
  { file: '10-shadow-dom.html', expectedFile: '10-shadow-dom.json', label: 'Open Shadow DOM 与不透明 closed host 诊断' },
  { file: '11-same-origin-iframe.html', expectedFile: '11-same-origin-iframe.json', label: '同源 iframe 递归与跨源拒绝诊断' },
  { file: '12-virtual-scroll.html', expectedFile: '12-virtual-scroll.json', label: '120行 / 20 DOM slots 的虚拟行复用与合法重复值' },
  { file: '13-fixed-columns.html', expectedFile: '13-fixed-columns.json', label: '独立 pinned 分片与缺少主表列的合并' },
  { file: '14-hidden-elements.html', expectedFile: '14-hidden-elements.json', label: '隐藏表、隐藏单元格和辅助文本' },
  { file: '15-complex-cell-content.html', expectedFile: '15-complex-cell-content.json', label: '按钮实际值、链接、换行与特殊字符' },
  { file: '16-multiple-tables.html', expectedFile: '16-multiple-tables.json', label: '同页 native / ARIA / div 候选' },
  { file: '17-layout-table-vs-data-table.html', expectedFile: '17-layout-table-vs-data-table.json', label: '布局、导航、表单与真实数据区分' },
  { file: '18-empty-table.html', expectedFile: '18-empty-table.json', label: '空表格的友好空状态' },
  { file: '19-large-table.html', expectedFile: '19-large-table.json', label: '100 / 1000 / 5000 数据行 × 20列性能' },
  { file: '20-malformed-table.html', expectedFile: '20-malformed-table.json', label: '无效 span、缺少单元格与行组边界' },
];

export const fixtureCatalog = fixtures;
