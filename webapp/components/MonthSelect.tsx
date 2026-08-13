"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { monthLabel } from "@/lib/format";

export function MonthSelect({
  months,
  value,
  basePath = "/",
}: {
  months: string[];
  value: string;
  basePath?: string;
}) {
  const router = useRouter();
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => router.push(`${basePath}?month=${e.target.value}`)}
        className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-700 cursor-pointer"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 text-slate-400 pointer-events-none" />
    </div>
  );
}
