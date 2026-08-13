import { DayCell } from "@/components/DayCell";
import type { CalendarEntry } from "@/lib/calendar";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function CalendarGrid({
  year,
  month,
  entries,
}: {
  year: number;
  month: number; // 1-12
  entries: CalendarEntry[];
}) {
  const startWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const byDay = new Map<number, CalendarEntry[]>();
  for (const e of entries) {
    const day = Number(e.settleDate.slice(8, 10));
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 text-xs font-medium">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`py-2 text-center ${
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const col = i % 7;
          return day ? (
            <DayCell key={i} day={day} weekday={col} entries={byDay.get(day) ?? []} />
          ) : (
            <div key={i} className="min-h-24 border-b border-r border-slate-100 p-1.5" />
          );
        })}
      </div>
    </div>
  );
}
