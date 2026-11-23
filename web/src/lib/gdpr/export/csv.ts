// Safe CSV for the export ZIP (docs/gdpr/export-spec.md, section 3, #167).
// UTF-8, comma separator, header first, RFC 4180 quoting, CRLF line endings.

export type CsvCell = string | number | boolean | null | undefined;

// Excel and Sheets run a text cell that starts with one of these as a formula.
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

// A leading single quote makes the spreadsheet read the cell as plain text.
export function neutralizeCell(value: string): string {
  return FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

function toCsvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  // Numbers and booleans are never formulas, so only text is neutralized.
  const text = typeof cell === "string" ? neutralizeCell(cell) : String(cell);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(toCsvCell).join(",") + "\r\n").join("");
}
