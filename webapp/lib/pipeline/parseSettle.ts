import { normalizeString } from "./normalize";

export interface SettleResult {
  settleDate: string | null;
  settleMethod: string | null;
  noteRaw: string | null;
}

// state-schema.md §6. 형식: "YYYY-MM-DD <수단>". 불일치/공백이면 settle_date는 null이고
// 원문은 noteRaw로 보존한다(추측하지 않는다).
export function parseSettle(rawNote: unknown): SettleResult {
  const note = normalizeString(rawNote);
  if (!note) {
    return { settleDate: null, settleMethod: null, noteRaw: null };
  }

  const match = note.match(/^(\d{4})-(\d{2})-(\d{2})\s*(.*)$/);
  if (!match) {
    return { settleDate: null, settleMethod: null, noteRaw: note };
  }
  const [, y, m, d, rest] = match;
  if (!isValidCalendarDate(y, m, d)) {
    return { settleDate: null, settleMethod: null, noteRaw: note };
  }
  const method = rest.trim();
  return {
    settleDate: `${y}-${m}-${d}`,
    settleMethod: method || null,
    noteRaw: note,
  };
}

function isValidCalendarDate(y: string, m: string, d: string): boolean {
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}
