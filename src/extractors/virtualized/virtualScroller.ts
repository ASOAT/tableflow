import type { DiagnosticCode, TableCandidate } from '../types';
import { virtualLimits, type VirtualLimits } from './config';
import { RowCollector } from './rowCollector';

export function findScrollContainer(source: Element): HTMLElement | null {
  const elements = [source, ...source.querySelectorAll('*')];
  for (let ancestor = source.parentElement; ancestor; ancestor = ancestor.parentElement) elements.push(ancestor);
  const possible = elements.filter((element): element is HTMLElement => {
    const view = element.ownerDocument.defaultView;
    const style = view?.getComputedStyle(element);
    return element.nodeType === 1 && 'scrollTop' in element && element.clientHeight > 0
      && element.scrollHeight > element.clientHeight + 1
      && /auto|scroll/.test(style?.overflowY || style?.overflow || '');
  });
  // Prefer a viewport inside the grid; a full-page scroll is a last resort.
  return possible[0] ?? null;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('ABORTED')); return; }
    const abort = () => { clearTimeout(timer); reject(new Error('ABORTED')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export interface VirtualCollectionOptions {
  limits?: Partial<VirtualLimits>;
  signal?: AbortSignal;
  onProgress?: (rows: number, iterations: number) => void;
}

/** Bounded, user-triggered collection. The page's original position is restored in finally. */
export async function collectVirtualTable(
  original: TableCandidate,
  read: () => TableCandidate | null,
  options: VirtualCollectionOptions = {},
): Promise<TableCandidate> {
  const limits = virtualLimits(options.limits);
  if (original.metadata.unsupported_reason === 'MALFORMED_STRUCTURE') {
    return failure(original, 'MALFORMED_STRUCTURE', '行列结构存在冲突，无法安全收集。');
  }
  const scroller = findScrollContainer(original.sourceElement);
  if (!scroller) return failure(original, 'UNSUPPORTED_STRUCTURE', '未找到可验证的垂直滚动容器，不能收集完整表格。');
  const startTop = scroller.scrollTop;
  const startLeft = scroller.scrollLeft;
  const focused = scroller.ownerDocument.activeElement as HTMLElement | null;
  const collector = new RowCollector();
  const deadline = performance.now() + limits.timeoutMs;
  let reason: DiagnosticCode | undefined;
  let reachedBottom = false;
  let stagnant = 0;
  let iterations = 0;
  let missingColumns = original.metadata.missingColumns === true;
  let expected = original.metadata.expectedRowCount;
  const datasetExpected = original.diagnostics?.expectedRows;
  let datasetChanged = false;
  const move = (top: number) => {
    scroller.scrollTop = top;
    const EventType = scroller.ownerDocument.defaultView?.Event ?? Event;
    scroller.dispatchEvent(new EventType('scroll', { bubbles: true }));
  };
  try {
    move(0);
    while (iterations < limits.maxIterations) {
      if (options.signal?.aborted) { reason = 'ABORTED'; break; }
      if (performance.now() >= deadline) { reason = 'TIMEOUT'; break; }
      await delay(Math.min(limits.settleMs, Math.max(1, deadline - performance.now())), options.signal);
      if (performance.now() >= deadline) { reason = 'TIMEOUT'; break; }
      const snapshot = read();
      if (!snapshot || !original.sourceElement.isConnected || !scroller.isConnected) { reason = 'ABORTED'; break; }
      if (snapshot.metadata.unsupported_reason === 'MALFORMED_STRUCTURE') { reason = 'MALFORMED_STRUCTURE'; break; }
      if (expected !== undefined && snapshot.metadata.expectedRowCount !== undefined
          && expected !== snapshot.metadata.expectedRowCount) {
        expected = snapshot.metadata.expectedRowCount;
        datasetChanged = true; reason = 'ABORTED'; break;
      }
      if (datasetExpected !== undefined && snapshot.diagnostics?.expectedRows !== undefined
        && datasetExpected !== snapshot.diagnostics.expectedRows) { datasetChanged = true; reason = 'ABORTED'; break; }
      expected ??= snapshot.metadata.expectedRowCount;
      missingColumns ||= snapshot.metadata.missingColumns === true;
      const newRows = collector.add(snapshot, limits.maxRows);
      iterations += 1;
      options.onProgress?.(collector.size, iterations);
      stagnant = newRows ? 0 : stagnant + 1;
      reachedBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (collector.truncated) { reason = 'ROW_LIMIT'; break; }
      if (reachedBottom) break;
      if (collector.size >= limits.maxRows) { reason = 'ROW_LIMIT'; break; }
      if (stagnant >= limits.noNewRowsThreshold) { reason = 'INCOMPLETE_GRID'; break; }
      move(Math.min(scroller.scrollHeight - scroller.clientHeight,
        scroller.scrollTop + Math.max(1, Math.floor(scroller.clientHeight * limits.stepRatio))));
    }
    if (!reason && !reachedBottom) reason = 'ITERATION_LIMIT';
  } catch (error) {
    if (options.signal?.aborted) reason = 'ABORTED';
    else throw error;
  } finally {
    move(startTop);
    scroller.scrollLeft = startLeft;
    // Allow the page to restore its recycled DOM, even when collection was canceled.
    await delay(limits.settleMs);
    if (focused?.isConnected && scroller.ownerDocument.activeElement !== focused) focused.focus({ preventScroll: true });
  }
  if (datasetChanged) {
    const changed = failure(original, 'ABORTED', '页面记录总数在收集时发生变化，请重新扫描；原快照不能继续导出。');
    changed.metadata.expectedRowCount = expected;
    return changed;
  }
  const gathered = collector.finish();
  if (collector.uncertain) reason = 'VIRTUAL_ROW_IDENTITY_UNCERTAIN';
  else if (collector.conflicts) reason = 'MALFORMED_STRUCTURE';
  else if (!gathered.completeIndices || missingColumns) reason ??= 'INCOMPLETE_GRID';
  else if (expected === undefined || gathered.rows.length !== expected) reason ??= 'INCOMPLETE_GRID';
  const complete = reachedBottom && !reason;
  return {
    ...original,
    rows: gathered.rows,
    columns: collector.columns,
    confidence: complete ? Math.max(original.confidence, 0.9) : Math.min(original.confidence, collector.uncertain ? 0.39 : 0.65),
    metadata: {
      ...original.metadata, headerRows: gathered.headerRows, rowMeta: gathered.rowMeta,
      complete, virtualized: true, expectedRowCount: expected,
      collectionVerified: complete,
      unsupported_reason: reason,
      warnings: complete ? [] : [`仅收集到 ${collector.size} 行数据，不能保证完整；原因：${reason ?? 'INCOMPLETE_GRID'}。`],
      diagnostics: complete ? [] : [{ code: reason ?? 'INCOMPLETE_GRID', message: '虚拟表格未通过完整性检查，仅可在确认后导出已收集数据。', certainty: 'confirmed' }],
    },
  };
}

function failure(candidate: TableCandidate, reason: DiagnosticCode, message: string): TableCandidate {
  return { ...candidate, metadata: { ...candidate.metadata, complete: false, unsupported_reason: reason,
    warnings: [message], diagnostics: [{ code: reason, message, certainty: 'confirmed' }] } };
}
