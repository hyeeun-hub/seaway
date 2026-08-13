"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarChip } from "@/components/CalendarChip";
import type { CalendarEntry } from "@/lib/calendar";

const MAX_VISIBLE = 3;
const POPOVER_WIDTH = 224;

export function DayCell({
  day,
  weekday,
  entries,
}: {
  day: number;
  weekday: number; // 0=일 ~ 6=토
  entries: CalendarEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const visible = entries.slice(0, MAX_VISIBLE);
  const hiddenCount = entries.length - visible.length;

  function openPopover() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12),
      });
    }
    setOpen(true);
  }

  return (
    // 하루에 몇 건이 있든 최대 3개 + "더보기" 버튼까지만 그려서 셀 높이의 상한을 통일한다.
    // 나머지는 팝오버(포털)로 빼서, 항목이 많은 날 때문에 달력 한 주 전체가 늘어나지 않게 한다.
    <div className="min-h-24 border-b border-r border-slate-100 p-1.5">
      <p
        className={`text-xs mb-1 ${
          weekday === 0 ? "text-red-500" : weekday === 6 ? "text-blue-500" : "text-slate-500"
        }`}
      >
        {day}
      </p>
      <div className="space-y-1">
        {visible.map((e) => (
          <CalendarChip key={e.id} e={e} />
        ))}
        {hiddenCount > 0 && (
          <button
            ref={btnRef}
            onClick={openPopover}
            className="w-full text-[11px] text-slate-400 hover:text-slate-600 text-left px-1.5"
          >
            +{hiddenCount}개 더보기
          </button>
        )}
      </div>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 rounded-lg border border-slate-200 bg-white shadow-xl p-2 space-y-1 max-h-72 overflow-y-auto"
              style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
            >
              <div className="flex items-center justify-between px-1 pb-1">
                <p className="text-xs font-medium text-slate-500">{day}일 전체 ({entries.length}건)</p>
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              </div>
              {entries.map((e) => (
                <CalendarChip key={e.id} e={e} />
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
