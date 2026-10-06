/** Independent parser for exported text; deliberately does not import serializers. */
export function parseDelimited(input: string, delimiter: ',' | '\t'): string[][] {
  const text = input.startsWith('\uFEFF') ? input.slice(1) : input;
  if (text.length === 0) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let closedQuote = false;
  let endedRow = false;

  const endCell = (): void => {
    row.push(value);
    value = '';
    closedQuote = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    endedRow = false;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        value += character;
      }
      continue;
    }

    if (character === delimiter) {
      endCell();
    } else if (character === '\n' || character === '\r') {
      endCell();
      rows.push(row);
      row = [];
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      endedRow = true;
    } else if (character === '"' && value === '' && !closedQuote) {
      quoted = true;
    } else {
      if (closedQuote || character === '"') throw new Error('Invalid delimited export: misplaced quote.');
      value += character;
    }
  }
  if (quoted) throw new Error('Invalid delimited export: unterminated quoted cell.');
  if (!endedRow) {
    endCell();
    rows.push(row);
  }
  return rows;
}
