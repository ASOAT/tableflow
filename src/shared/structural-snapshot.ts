export interface StructuralNode {
  tag: string;
  attributes?: Record<string, string | number>;
  classes?: string[];
  dataAttributes?: string[];
  children?: StructuralNode[];
}
export interface StructuralSnapshot {
  schemaVersion: 1;
  root: StructuralNode | null;
  nodeCount: number;
  truncated: boolean;
}
export interface StructuralSnapshotLimits { maxNodes?: number; maxDepth?: number; }

const sensitiveAttribute = /token|auth|secret|password|session|cookie|key/i;
const ignoredTags = new Set(['script', 'style', 'template', 'noscript', 'svg', 'canvas']);
const numericAttributes = new Set(['aria-rowindex', 'aria-colindex', 'aria-rowcount', 'aria-colcount',
  'aria-rowspan', 'aria-colspan', 'rowspan', 'colspan']);
const roles = new Set(['table', 'grid', 'treegrid', 'row', 'rowgroup', 'columnheader', 'rowheader', 'gridcell',
  'cell', 'presentation', 'none', 'checkbox', 'radio', 'button', 'combobox', 'option', 'listbox', 'navigation',
  'form', 'tooltip', 'progressbar', 'region', 'group', 'alert', 'list', 'listitem']);
const structuralData = new Set(['data-row-index', 'data-col-index', 'data-column-index', 'data-row-count',
  'data-virtualized', 'data-header', 'data-field', 'data-col-id']);
// Exact tokens only: arbitrary framework-prefixed classes can themselves contain user data.
const frameworkClasses = new Set([
  'ant-table-wrapper', 'ant-table', 'ant-table-container', 'ant-table-content', 'ant-table-header', 'ant-table-body',
  'ant-table-thead', 'ant-table-tbody', 'ant-table-tfoot', 'ant-table-summary', 'ant-table-row', 'ant-table-cell',
  'ant-table-selection-column', 'ant-table-expand-icon-col', 'ant-table-row-expand-icon', 'ant-table-expanded-row',
  'ant-table-placeholder', 'ant-table-cell-fix-left', 'ant-table-cell-fix-right', 'ant-table-fixed-left',
  'ant-table-fixed-right', 'ant-table-body-inner', 'ant-pagination', 'ant-spin', 'ant-spin-spinning',
  'ant-checkbox', 'ant-checkbox-inner', 'ant-radio',
  'el-table', 'el-table__header-wrapper', 'el-table__body-wrapper', 'el-table__footer-wrapper', 'el-table__header',
  'el-table__body', 'el-table__footer', 'el-table__fixed', 'el-table__fixed-right', 'el-table__fixed-header-wrapper',
  'el-table__fixed-body-wrapper', 'el-table__fixed-footer-wrapper', 'el-table__row', 'el-table__cell',
  'el-table__expanded-cell', 'el-table__expand-icon', 'el-table__empty-block', 'el-table__empty-text',
  'el-pagination', 'el-loading-mask', 'el-checkbox', 'el-checkbox__input', 'el-checkbox__inner', 'el-radio',
  'MuiDataGrid-root', 'MuiDataGrid-main', 'MuiDataGrid-columnHeader', 'MuiDataGrid-columnHeaders',
  'MuiDataGrid-columnHeaderTitle', 'MuiDataGrid-row', 'MuiDataGrid-cell', 'MuiDataGrid-virtualScroller',
  'MuiDataGrid-virtualScrollerContent', 'MuiDataGrid-virtualScrollerRenderZone', 'MuiDataGrid-pinnedColumns--left',
  'MuiDataGrid-pinnedColumns--right', 'MuiDataGrid-footerContainer', 'MuiDataGrid-loadingOverlay',
  'MuiTablePagination-root', 'MuiCheckbox-root', 'MuiRadio-root',
  'ag-root-wrapper', 'ag-root', 'ag-body-viewport', 'ag-center-cols-viewport', 'ag-center-cols-container',
  'ag-grid-viewport', 'ag-grid-scrollable-area', 'ag-grid-pinned-left-cells', 'ag-grid-pinned-right-cells',
  'ag-grid-scrolling-cells', 'ag-row', 'ag-cell', 'ag-header', 'ag-header-row', 'ag-header-cell',
  'ag-header-group-cell', 'ag-pinned-left-header', 'ag-pinned-right-header', 'ag-pinned-left-cols-container',
  'ag-pinned-right-cols-container', 'ag-floating-bottom', 'ag-floating-top', 'ag-pinned-bottom', 'ag-pinned-top',
  'ag-full-width-row', 'ag-paging-panel', 'ag-overlay-loading-center', 'ag-selection-checkbox', 'ag-checkbox-input-wrapper',
  'datagrid-view', 'datagrid-view1', 'datagrid-view2', 'datagrid-header', 'datagrid-body',
  'ui-jqgrid', 'ui-jqgrid-hbox', 'ui-jqgrid-htable', 'ui-jqgrid-bdiv', 'ui-jqgrid-btable', 'frozen-bdiv', 'frozen-div',
]);

function limit(value: number | undefined, maximum: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value))) : maximum;
}

/** Structural data only. Never copy text, values, URLs, styles, IDs, or arbitrary attributes. */
export function sanitizeStructuralSnapshot(element: Element, limits: StructuralSnapshotLimits = {}): StructuralSnapshot {
  const maxNodes = limit(limits.maxNodes, 5_000);
  const maxDepth = limit(limits.maxDepth, 40);
  let nodeCount = 0;
  let truncated = false;
  const hiddenCache = new WeakMap<Element, boolean>();
  function hidden(node: Element): boolean {
    const cached = hiddenCache.get(node);
    if (cached !== undefined) return cached;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    const clipped = style?.position === 'absolute' && style.overflow === 'hidden'
      && Number.parseFloat(style.width) <= 1 && Number.parseFloat(style.height) <= 1
      && ((style.clip !== '' && style.clip !== 'auto') || (style.clipPath !== '' && style.clipPath !== 'none'));
    const value = node.hasAttribute('hidden') || node.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true'
      || node.matches('input[type="hidden"]')
      || style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse'
      || style?.opacity === '0' || clipped || (node.parentElement !== null && hidden(node.parentElement));
    hiddenCache.set(node, value);
    return value;
  }
  function visit(node: Element, depth: number): StructuralNode | null {
    const tag = node.localName.toLowerCase();
    if (ignoredTags.has(tag) || hidden(node)) return null;
    if (nodeCount >= maxNodes || depth > maxDepth) { truncated = true; return null; }
    nodeCount += 1;
    const result: StructuralNode = { tag };
    const attributes: Record<string, string | number> = {};
    const dataAttributes: string[] = [];
    for (const attribute of node.attributes) {
      const name = attribute.name.toLowerCase();
      if (sensitiveAttribute.test(name)) continue;
      if (name === 'role' && roles.has(attribute.value.trim().toLowerCase())) attributes.role = attribute.value.trim().toLowerCase();
      else if (numericAttributes.has(name) && /^-?\d{1,7}$/.test(attribute.value)) {
        const value = Number(attribute.value);
        if (Number.isSafeInteger(value) && value >= -1 && value <= 1_000_000) attributes[name] = value;
      } else if (structuralData.has(name)) dataAttributes.push(name);
    }
    if (Object.keys(attributes).length) result.attributes = attributes;
    const classes = Array.from(node.classList).filter((token) => frameworkClasses.has(token));
    if (classes.length) result.classes = classes;
    if (dataAttributes.length) result.dataAttributes = dataAttributes.sort();
    const children: StructuralNode[] = [];
    for (const child of node.children) {
      if (nodeCount >= maxNodes) { truncated = true; break; }
      const sanitized = visit(child, depth + 1);
      if (sanitized) children.push(sanitized);
    }
    if (children.length) result.children = children;
    return result;
  }
  return { schemaVersion: 1, root: visit(element, 0), nodeCount, truncated };
}
