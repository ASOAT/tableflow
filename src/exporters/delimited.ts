import type { TableMatrix } from '../shared/table';

function quoteCell(value: string, delimiter: ',' | '\t'): string {
  if (value.includes(delimiter) || /["\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function serialize(matrix: TableMatrix, delimiter: ',' | '\t'): string {
  return matrix
    .map((row) => row.map((cell) => quoteCell(cell, delimiter)).join(delimiter))
    .join('\r\n');
}

/** Excel-compatible text: CRLF rows and quoted tabs, quotes, or line breaks. */
export function toTsv(matrix: TableMatrix): string {
  return serialize(matrix, '\t');
}

/** CSV text includes a BOM; save its UTF-8 bytes when creating a file. */
export function toCsv(matrix: TableMatrix): string {
  return `\uFEFF${serialize(matrix, ',')}`;
}
