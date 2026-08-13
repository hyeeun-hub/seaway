import * as XLSX from "xlsx";

export interface GenericParseResult {
  sheet: string;
  headerRow: number;
  dataStartRow: number;
  rows: Record<string, unknown>[]; // 헤더명 -> 셀 원본값
  anomalies: string[];
}

// L2 마스터 파일용 범용 파서. ERP 4종과 열 구성이 전혀 달라 columnMap.ts를 쓰지 않는다.
// "0행 제목 / 1행 헤더 / 2행부터 데이터" 구조는 동일하다고 본다.
export function parseGenericSheet(buffer: Buffer, requiredHeaders: string[]): GenericParseResult {
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

  const missing = requiredHeaders.filter((col) => !headerNames.includes(col));
  if (missing.length > 0) {
    return {
      sheet: sheetName,
      headerRow,
      dataStartRow,
      rows: [],
      anomalies: [`필수 열 없음: ${missing.join(", ")}`],
    };
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = dataStartRow; r < grid.length; r++) {
    const row = grid[r] as unknown[];
    if (!row || row.every((c) => c === "" || c === undefined || c === null)) {
      continue;
    }
    const obj: Record<string, unknown> = {};
    headerNames.forEach((name, i) => {
      if (name) obj[name] = row[i];
    });
    rows.push(obj);
  }

  return { sheet: sheetName, headerRow, dataStartRow, rows, anomalies: [] };
}
