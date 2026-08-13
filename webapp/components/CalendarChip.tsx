import { shortWon } from "@/lib/format";
import type { CalendarEntry } from "@/lib/calendar";

// 매출(수금, 돈이 들어옴)은 파란색, 매입(결제, 돈이 나감)은 주황색.
// 확정은 진하게 채운 색, 예정은 옅은 색+테두리로 상태도 함께 구분한다.
export function chipClass(e: Pick<CalendarEntry, "side" | "status">): string {
  if (e.side === "매출") {
    return e.status === "확정"
      ? "bg-blue-600 text-white"
      : "bg-blue-50 text-blue-700 border border-blue-300";
  }
  return e.status === "확정"
    ? "bg-orange-500 text-white"
    : "bg-orange-50 text-orange-700 border border-orange-300";
}

export function CalendarChip({ e }: { e: CalendarEntry }) {
  const arrow = e.side === "매출" ? "↓" : "↑";
  return (
    <div
      className={`rounded px-1.5 py-1 text-[11px] leading-tight ${chipClass(e)}`}
      title={`${e.side} · ${e.status} · ${e.place || e.proj} ${e.amount.toLocaleString()}원`}
    >
      <p className="font-semibold">
        {arrow} {shortWon(e.amount)}
      </p>
      <p className="truncate opacity-90">{e.place || e.proj}</p>
    </div>
  );
}
