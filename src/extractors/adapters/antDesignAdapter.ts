import type { Extractor } from '../types';
import { collectRoots, extractTableWidget } from './shared';

export const antDesignAdapter: Extractor = {
  type: 'ant-design', priority: 30,
  detect: (root) => collectRoots(root, '.ant-table, .ant-table-wrapper')
    .filter((element) => (element.matches('.ant-table-wrapper') || !element.closest('.ant-table-wrapper'))
      && !!element.querySelector('.ant-table-body table, .ant-table-content table')),
  extract: (element) => extractTableWidget(element, {
    type: 'ant-design', body: '.ant-table-body table, .ant-table-body-inner table, .ant-table-content table',
    header: '.ant-table-header table', footer: '.ant-table-summary table',
    fixedLeft: '.ant-table-fixed-left', fixedRight: '.ant-table-fixed-right',
    expanded: '.ant-table-expanded-row, [class*="ant-table-expanded-row-level-"]',
    sizing: '.ant-table-measure-row, .ant-table-placeholder',
    empty: '.ant-table-placeholder',
  }),
};
export default antDesignAdapter;
