import * as XLSX from "xlsx";
import { KIND_COLUMNS, COMMON_COLUMNS, requiredColumns } from "./columnMap";
import type { ErpKind, RawRow } from "./types";

export interface ParseResult {
  sheet: string;
  headerRow: number; // 0-based
  dataStartRow: number; // 0-based
  rows: RawRow[];
  anomalies: string[];
}

// state-schema.md §3: "0행 제목 / 1행 헤더 / 2행부터 데이터" 구조가 고정이라고 본다.
// 헤더행에서 매핑표의 열 이름을 찾지 못하면 추측하지 않고 anomaly로 남긴다.
export function parseSheet(buffer: Buffer, kind: ErpKind): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
  });

  const headerRow = 1;
  const dataStartRow = 2;
  const header = (grid[headerRow] ?? []) as unknown[];
  const headerNames = header.map((h) => String(h ?? "").trim());

  const required = requiredColumns(kind);
  const missing = required.filter((col) => !headerNames.includes(col));
  if (missing.length > 0) {
    return {
      sheet: sheetName,
      headerRow,
      dataStartRow,
      rows: [],
      anomalies: [`필수 열 없음: ${missing.join(", ")}`],
    };
  }

  const colIndex = (name: string) => headerNames.indexOf(name);
  const kindCols = KIND_COLUMNS[kind];
  const idx = {
    date: colIndex(kindCols.date),
    place: colIndex(kindCols.place),
    amount: colIndex(kindCols.amount),
    evidence: kindCols.evidence ? colIndex(kindCols.evidence) : -1,
    payer: kindCols.payer ? colIndex(kindCols.payer) : -1,
    use: colIndex(COMMON_COLUMNS.use),
    content: colIndex(COMMON_COLUMNS.content),
    proj: colIndex(COMMON_COLUMNS.proj),
    note: colIndex(COMMON_COLUMNS.note),
    memo: colIndex(COMMON_COLUMNS.memo),
  };

  const rows: RawRow[] = [];
  for (let r = dataStartRow; r < grid.length; r++) {
    const row = grid[r] as unknown[];
    if (!row || row.every((c) => c === "" || c === undefined || c === null)) {
      continue; // 완전 공백 행은 데이터로 보지 않는다
    }
    rows.push({
      rowIndex: r,
      date: row[idx.date],
      place: row[idx.place],
      amount: row[idx.amount],
      evidence: idx.evidence >= 0 ? row[idx.evidence] : undefined,
      payer: idx.payer >= 0 ? row[idx.payer] : undefined,
      use: row[idx.use],
      content: row[idx.content],
      proj: row[idx.proj],
      note: row[idx.note],
      memo: row[idx.memo],
    });
  }

  return { sheet: sheetName, headerRow, dataStartRow, rows, anomalies: [] };
}
