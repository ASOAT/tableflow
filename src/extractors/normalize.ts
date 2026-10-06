const ignoredTags = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'CANVAS', 'IFRAME']);
const blockTags = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR',
  'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'UL']);
const preservedNewlines = new Set(['pre', 'pre-wrap', 'pre-line', 'break-spaces']);

export function createVisibilityCheck(): (element: Element) => boolean {
  const cache = new WeakMap<Element, boolean>();
  function hidden(element: Element): boolean {
    const cached = cache.get(element);
    if (cached !== undefined) return cached;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const clipped = style?.position === 'absolute' && style.overflow === 'hidden'
      && Number.parseFloat(style.width) <= 1 && Number.parseFloat(style.height) <= 1
      && ((style.clip !== '' && style.clip !== 'auto') || (style.clipPath !== '' && style.clipPath !== 'none'));
    const value = element.hasAttribute('hidden') || element.getAttribute('aria-hidden')?.trim().toLowerCase() === 'true'
      || element.getAttribute('role') === 'tooltip' || style?.display === 'none'
      || style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.opacity === '0'
      || clipped || (element.parentElement !== null && hidden(element.parentElement));
    cache.set(element, value);
    return value;
  }
  return hidden;
}

/** Share visibility caches across the cells of one extraction snapshot. */
export function createTextExtractor(options: { includeButtons?: boolean } = {}): (element: Element) => string {
  const isHidden = createVisibilityCheck();
  const whiteSpaceCache = new WeakMap<Element, string>();
  function whiteSpace(element: Element): string {
    const cached = whiteSpaceCache.get(element);
    if (cached !== undefined) return cached;
    const own = element.ownerDocument.defaultView?.getComputedStyle(element).whiteSpace;
    const value = own || (element.tagName === 'PRE' ? 'pre'
      : element.parentElement ? whiteSpace(element.parentElement) : 'normal');
    whiteSpaceCache.set(element, value);
    return value;
  }
  return function read(root: Element): string {
    if (isHidden(root)) return '';
    let text = '';
    const append = (value: string, mode: string) => {
      const cleaned = value.replace(/[\u200B\uFEFF]/g, '').replace(/\r\n?/g, '\n');
      text += preservedNewlines.has(mode) ? cleaned.replace(/[^\S\n]+/g, ' ') : cleaned.replace(/\s+/g, ' ');
    };
    const lineBreak = () => { if (text && !text.endsWith('\n')) text += '\n'; };
    function visit(node: Node, mode: string): void {
      if (node.nodeType === 3) { append(node.textContent ?? '', mode); return; }
      if (node.nodeType !== 1) return;
      const element = node as Element;
      const tag = element.tagName.toUpperCase();
      if (ignoredTags.has(tag) || (element !== root && tag === 'TABLE') || isHidden(element)
        || (tag === 'BUTTON' && options.includeButtons === false)) return;
      if (tag === 'BR') { text += '\n'; return; }
      if (tag === 'SELECT') {
        append(Array.from((element as HTMLSelectElement).selectedOptions, (option) => option.textContent ?? '').join(', '), mode);
        return;
      }
      if (tag === 'INPUT') {
        const input = element as HTMLInputElement;
        if (!['hidden', 'button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'password'].includes(input.type)) append(input.value, mode);
        return;
      }
      if (tag === 'TEXTAREA') { append((element as HTMLTextAreaElement).value, 'pre-line'); return; }
      const block = element !== root && blockTags.has(tag);
      if (block) lineBreak();
      const nextMode = whiteSpace(element);
      for (const child of element.childNodes) visit(child, nextMode);
      if (block) lineBreak();
    }
    visit(root, whiteSpace(root));
    return text.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim();
  };
}

export function extractVisibleText(element: Element): string {
  return createTextExtractor()(element);
}

export function normalizeMatrix(rows: string[][]): string[][] {
  const columns = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  return rows.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? ''));
}

export function hasScrollableViewport(element: Element): boolean {
  for (const candidate of [element, ...element.querySelectorAll('*')]) {
    const style = candidate.ownerDocument.defaultView?.getComputedStyle(candidate);
    const scrolls = [style?.overflowY, style?.overflow].some((value) => /^(auto|scroll|overlay)$/.test(value ?? ''));
    if (scrolls && candidate.clientHeight > 0
      && candidate.scrollHeight > candidate.clientHeight + 1) return true;
  }
  return false;
}
