import { ariaGridExtractor } from '../ariaGridExtractor';
import type { Extractor } from '../types';
import { createTextExtractor, createVisibilityCheck } from '../normalize';
import { collectRoots, filterGridColumns, makeCandidate, positiveIndex } from './shared';

export const muiDataGridAdapter: Extractor = {
  type: 'mui-data-grid', priority: 32,
  detect: (root) => collectRoots(root, '.MuiDataGrid-root').filter((element) =>
    (element.matches('[role="grid"], [role="treegrid"]') || element.querySelector('[role="grid"], [role="treegrid"]'))
    && !!element.querySelector('[role="row"] [role="gridcell"], [role="columnheader"]')),
  extract: (element) => {
    const grid = element.matches('[role="grid"], [role="treegrid"]') ? element
      : element.querySelector('[role="grid"], [role="treegrid"]');
    if (!grid) return null;
    const candidate = ariaGridExtractor.extract(grid);
    if (!candidate) return null;
    const read = createTextExtractor();
    const hidden = createVisibilityCheck();
    const cells = Array.from(grid.querySelectorAll('[role="columnheader"],[role="gridcell"],[role="cell"]'))
      .filter((cell) => cell.closest('[role="grid"],[role="treegrid"]') === grid && !hidden(cell))
      .flatMap((cell) => {
        const index = positiveIndex(cell, 'aria-colindex');
        return index === undefined ? [] : [{ element: cell, index, value: read(cell),
          kind: cell.getAttribute('role') === 'columnheader' ? 'header' as const : 'data' as const }];
      });
    const filtered = filterGridColumns(candidate.rows, candidate.metadata, cells);
    return makeCandidate(element, 'mui-data-grid', filtered.rows, filtered.metadata, 0.98);
  },
};
export default muiDataGridAdapter;
