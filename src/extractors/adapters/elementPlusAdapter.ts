import type { Extractor } from '../types';
import { collectRoots, extractTableWidget } from './shared';

export const elementPlusAdapter: Extractor = {
  type: 'element-plus', priority: 31,
  detect: (root) => collectRoots(root, '.el-table')
    .filter((element) => !!element.querySelector('.el-table__body-wrapper table, table.el-table__body')),
  extract: (element) => extractTableWidget(element, {
    type: 'element-plus', body: '.el-table__body-wrapper table, .el-table__fixed-body-wrapper table, table.el-table__body',
    header: '.el-table__header-wrapper table, .el-table__fixed-header-wrapper table, table.el-table__header',
    footer: '.el-table__footer-wrapper table, .el-table__fixed-footer-wrapper table, table.el-table__footer',
    fixedLeft: '.el-table__fixed', fixedRight: '.el-table__fixed-right',
    expanded: '.el-table__expanded-cell', sizing: '.el-table__placeholder',
    empty: '.el-table__empty-block',
  }),
};
export default elementPlusAdapter;
