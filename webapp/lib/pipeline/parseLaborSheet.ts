import * as XLSX from "xlsx";
import type { RawRow } from "./types";

export interface ParseResult {
  sheet: string;
  headerRow: number;
  dataStartRow: number;
  rows: RawRow[];
  anomalies: string[];
}

type LaborKind = "인건비-급여대장" | "인건비-4대보험";

// 급여대장/4대보험조회는 ERP 4종과 열 구성이 완전히 다르다(용도/내용/메모 열이 없음).
// 기간은 작성일자·고지일이 아니라 귀속년월/고지년월을 쓴다 — 실데이터에 작성일자가
// 귀속월보다 최대 2개월 늦은 사례가 있어(3월 귀속 일용직을 5월에 작성), 작성일자로
// 나누면 월별 추이가 밀린다.
const LABOR_COLUMNS: Record<
  LaborKind,
  { period: string; place: string; amount: string; use: string; note: string; proj: string | null }
> = {
  "인건비-급여대장": {
    period: "귀속년월",
    place: "제목",
    amount: "지급액",
    use: "구분",
    note: "비고",
    proj: "프로젝트/현장",
  },
  "인건비-4대보험": {
    period: "고지년월",
    place: "종류",
    amount: "납부할금액",
    use: "종류",
    note: "비고",
    proj: null,
  },
};

export function parseLaborSheet(buffer: Buffer, kind: LaborKind): ParseResult {
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
  const colIndex = (name: string) => headerNames.indexOf(name);

  const cols = LABOR_COLUMNS[kind];
  const required = [cols.period, cols.place, cols.amount, cols.use, cols.note, ...(cols.proj ? [cols.proj] : [])];
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

  const idx = {
    period: colIndex(cols.period),
    place: colIndex(cols.place),
    amount: colIndex(cols.amount),
    use: colIndex(cols.use),
    note: colIndex(cols.note),
    proj: cols.proj ? colIndex(cols.proj) : -1,
  };

  const rows: RawRow[] = [];
  for (let r = dataStartRow; r < grid.length; r++) {
    const row = grid[r] as unknown[];
    if (!row || row.every((c) => c === "" || c === undefined || c === null)) {
      continue;
    }
    const periodRaw = String(row[idx.period] ?? "").trim();
    const periodMatch = periodRaw.match(/^(\d{4})-(\d{2})/);
    // 귀속년월/고지년월은 "YYYY-MM"이라 일자가 없다 — 1일을 붙여 기존 normalizeDate가
    // 그대로 파싱하게 한다(월별 집계는 이 값의 앞 7자리만 쓰므로 일자는 의미 없는 placeholder).
    const dateValue = periodMatch ? `${periodMatch[1]}-${periodMatch[2]}-01` : "";

    rows.push({
      rowIndex: r,
      date: dateValue,
      place: row[idx.place],
      amount: row[idx.amount],
      evidence: undefined,
      payer: undefined,
      use: row[idx.use],
      content: "",
      proj: idx.proj >= 0 ? row[idx.proj] : "",
      note: row[idx.note],
      memo: "",
    });
  }

  return { sheet: sheetName, headerRow, dataStartRow, rows, anomalies: [] };
}
