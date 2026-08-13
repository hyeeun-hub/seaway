import * as XLSX from "xlsx";

// state-schema.md §5 정규화 규칙.

export function normalizeString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).normalize("NFC").trim();
}

// "YYYY-MM-DD" 또는 "YYYY-MM-DD HH:MM" 형태를 받아 날짜만 취한다.
// 엑셀 시리얼 날짜(숫자)나 Date 객체가 들어와도 방어적으로 처리한다.
export function normalizeDate(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    const y = parsed.y;
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = normalizeString(v);
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isValidCalendarDate(isoMatch[1], isoMatch[2], isoMatch[3])
      ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      : null;
  }
  const dotMatch = s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (dotMatch) {
    const [, y, mo, d] = dotMatch;
    const m = mo.padStart(2, "0");
    const dd = d.padStart(2, "0");
    return isValidCalendarDate(y, m, dd) ? `${y}-${m}-${dd}` : null;
  }
  return null;
}

function isValidCalendarDate(y: string, m: string, d: string): boolean {
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// 콤마/공백/통화기호 제거 후 정수 변환. 실패 또는 공백이면 null(0으로 채우지 않는다).
export function normalizeAmount(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    return Number.isFinite(v) ? Math.round(v) : null;
  }
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}
