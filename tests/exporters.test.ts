import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyMatrix, toClipboardHtml } from '../src/exporters/clipboard';
import { toCsv, toTsv } from '../src/exporters/delimited';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => undefined });
  Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: () => false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else Reflect.deleteProperty(document, 'execCommand');
  document.body.replaceChildren();
});

describe('delimited exporters', () => {
  it('serializes Chinese, commas, quotes, line breaks and empty CSV cells with a BOM', () => {
    const matrix = [
      ['姓名', '说明', '空值'],
      ['张三', '苹果,梨子', ''],
      ['李四', '他说 "你好"\n第二行', '结束'],
    ];
    expect(toCsv(matrix)).toBe('\uFEFF姓名,说明,空值\r\n张三,"苹果,梨子",\r\n李四,"他说 ""你好""\n第二行",结束');
  });

  it('quotes tabs, quotes and every supported line break in TSV without quoting ordinary commas', () => {
    expect(toTsv([['中文', 'a,b', 'a\tb', '"quote"', 'a\r\nb', 'a\rb', 'a\nb', '']]))
      .toBe('中文\ta,b\t"a\tb"\t"""quote"""\t"a\r\nb"\t"a\rb"\t"a\nb"\t');
  });

  it('preserves leading and trailing empty cells and uses CRLF between rows', () => {
    expect(toTsv([['', 'value', ''], ['', '', '']])).toBe('\tvalue\t\r\n\t\t');
    expect(toCsv([['', 'value', ''], ['', '', '']])).toBe('\uFEFF,value,\r\n,,');
  });

  it('does not alter cell text or append a final line break', () => {
    expect(toCsv([['  spaced  ', 'a\tb']])).toBe('\uFEFF  spaced  ,a\tb');
    expect(toTsv([])).toBe('');
    expect(toCsv([])).toBe('\uFEFF');
  });
});

describe('clipboard exporters', () => {
  it('creates safe HTML cells and real line break elements', () => {
    const html = toClipboardHtml([['<img src=x onerror="alert(1)">', 'first\nsecond', '']]);
    const parser = document.createElement('div');
    parser.innerHTML = html;
    expect(parser.querySelector('img')).toBeNull();
    const cells = parser.querySelectorAll('td');
    expect(cells).toHaveLength(3);
    expect(cells[0]?.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(cells[1]?.querySelectorAll('br')).toHaveLength(1);
    expect(cells[1]?.textContent).toBe('firstsecond');
    expect(cells[2]?.textContent).toBe('');
  });

  it('starts a rich clipboard write immediately with TSV and HTML', async () => {
    class MockClipboardItem {
      constructor(public readonly data: Record<string, Blob>) {}
    }
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ write, writeText } as unknown as Clipboard);

    const pending = copyMatrix([['中文', 'a\nb']]);
    expect(write).toHaveBeenCalledTimes(1);
    const items = write.mock.calls[0]?.[0] as MockClipboardItem[];
    expect(items[0]?.data['text/plain']?.type).toBe('text/plain');
    expect(items[0]?.data['text/html']?.type).toBe('text/html');
    const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    expect(await readBlob(items[0]!.data['text/plain']!)).toBe('中文\t"a\nb"');
    expect(await readBlob(items[0]!.data['text/html']!)).toContain('<br>');
    await pending;
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to direct text copying when rich clipboard writes reject', async () => {
    class MockClipboardItem {
      constructor(public readonly data: Record<string, Blob>) {}
    }
    const write = vi.fn().mockRejectedValue(new Error('Unsupported HTML clipboard'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ write, writeText } as unknown as Clipboard);
    await copyMatrix([['A', 'B'], ['1', '2']]);
    expect(writeText).toHaveBeenCalledWith('A\tB\r\n1\t2');
  });

  it('uses direct writeText when ClipboardItem is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('ClipboardItem', undefined);
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard);
    const pending = copyMatrix([['中文']]);
    expect(writeText).toHaveBeenCalledWith('中文');
    await pending;
  });

  it('copies both formats through a temporary selection on insecure pages and removes it', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard);
    const setData = vi.fn();
    const execCommand = vi.fn(() => {
      const event = new Event('copy', { cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { setData } });
      document.dispatchEvent(event);
      return true;
    });
    vi.spyOn(document, 'execCommand').mockImplementation(execCommand);
    await copyMatrix([['中文', '<b>文字</b>']]);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(setData).toHaveBeenCalledWith('text/plain', '中文\t<b>文字</b>');
    expect(setData).toHaveBeenCalledWith('text/html', expect.stringContaining('&lt;b&gt;文字&lt;/b&gt;'));
    expect(document.querySelector('[data-tableflow-clipboard]')).toBeNull();
  });

  it('tries a contenteditable selection if textarea copying fails', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard);
    const execCommand = vi.spyOn(document, 'execCommand').mockReturnValueOnce(false).mockImplementationOnce(() => {
      expect(document.querySelector('[data-tableflow-clipboard] table')?.textContent).toBe('onetwo');
      expect(document.getSelection()?.toString()).toBe('onetwo');
      return true;
    });
    await copyMatrix([['one', 'two']]);
    expect(execCommand).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-tableflow-clipboard]')).toBeNull();
  });

  it('restores the prior focus and document selection after copying', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard);
    vi.spyOn(document, 'execCommand').mockReturnValue(true);
    const button = document.createElement('button');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'existing selection';
    document.body.append(button, paragraph);
    button.focus();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    await copyMatrix([['new value']]);
    expect(document.activeElement).toBe(button);
    expect(document.getSelection()?.toString()).toBe('existing selection');
  });

  it('reports a friendly error and cleans temporary elements when every path fails', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard);
    vi.spyOn(document, 'execCommand').mockReturnValue(false);
    await expect(copyMatrix([['value']])).rejects.toThrow('复制失败');
    expect(document.querySelector('[data-tableflow-clipboard]')).toBeNull();
  });
});
