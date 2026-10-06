import { afterEach, describe, expect, it } from 'vitest';
import { collectVirtualTable } from '../src/extractors/virtualized/virtualScroller';
import type { TableCandidate } from '../src/extractors/types';

function setup() {
  document.body.innerHTML = '<form><input id="focused"><button type="submit">提交</button></form><div id="viewport" style="overflow-y:auto"><input type="checkbox" checked><button aria-expanded="true">展开</button></div>';
  const viewport = document.querySelector<HTMLElement>('#viewport')!;
  Object.defineProperties(viewport, { clientHeight: { value: 20 }, scrollHeight: { value: 100 } });
  viewport.scrollTop = 40; viewport.scrollLeft = 11;
  const input = document.querySelector<HTMLInputElement>('#focused')!; input.focus();
  const snapshot = (): TableCandidate => {
    const start = Math.min(8, Math.floor(viewport.scrollTop / 10));
    return { id: 'v', type: 'aria-grid', confidence: 0.94, sourceElement: viewport, columns: 1,
      rows: [['字段'], [String(start)], [String(start + 1)]], metadata: { headerRows: 1,
        expectedRowCount: 11, complete: false, virtualized: true,
        rowMeta: [{ kind: 'header' }, { kind: 'data', index: start + 2 }, { kind: 'data', index: start + 3 }] } };
  };
  return { viewport, input, snapshot };
}
afterEach(() => document.body.replaceChildren());
describe('collection side effects and abnormal DOM', () => {
  it('restores scroll/focus without selecting rows, expanding controls or submitting forms', async () => {
    const { viewport, input, snapshot } = setup(); let submits = 0; let clicks = 0;
    document.querySelector('form')!.addEventListener('submit', (event) => { submits += 1; event.preventDefault(); });
    document.body.addEventListener('click', () => { clicks += 1; });
    const result = await collectVirtualTable(snapshot(), snapshot, { limits: { settleMs: 1, stepRatio: 0.5 } });
    expect(result.metadata.complete).toBe(true);
    expect(viewport.scrollTop).toBe(40); expect(viewport.scrollLeft).toBe(11); expect(document.activeElement).toBe(input);
    expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(document.querySelector('[aria-expanded]')!.getAttribute('aria-expanded')).toBe('true');
    expect(clicks).toBe(0); expect(submits).toBe(0);
  });
  it('reports partial data when a component unmounts during collection', async () => {
    const { viewport, snapshot } = setup(); const original = snapshot();
    const result = await collectVirtualTable(original, () => { viewport.remove(); return snapshot(); }, { limits: { settleMs: 1 } });
    expect(result.metadata.complete).toBe(false); expect(result.metadata.unsupported_reason).toBe('ABORTED');
  });
  it('reports partial data if a scroll container is removed independently of the source', async () => {
    const { viewport, snapshot } = setup(); const source = document.createElement('div'); viewport.append(source);
    const original = { ...snapshot(), sourceElement: source };
    const result = await collectVirtualTable(original, () => {
      document.body.append(source); viewport.remove(); return { ...snapshot(), sourceElement: source };
    }, { limits: { settleMs: 1 } });
    expect(result.metadata.complete).toBe(false); expect(result.metadata.unsupported_reason).toBe('ABORTED');
  });
});
