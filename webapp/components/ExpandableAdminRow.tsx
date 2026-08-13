"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { won } from "@/lib/format";

export interface UnclassifiedTx {
  id: string;
  date: string;
  place: string;
  proj: string;
  amount: number | null;
  memo: string;
}

export function ExpandableAdminRow({
  category,
  count,
  amount,
  transactions,
  badge,
}: {
  category: string;
  count: number;
  amount: number;
  transactions: UnclassifiedTx[];
  badge?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-slate-50"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-2.5 pr-4 text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {category}
            {badge && (
              <span className="text-xs rounded-full bg-amber-50 text-amber-600 px-2 py-0.5 font-medium">
                {badge}
              </span>
            )}
          </span>
        </td>
        <td className="py-2.5 pr-4 text-right text-slate-500">{count}</td>
        <td className="py-2.5 text-right font-medium text-slate-900">{won(amount)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3} className="bg-slate-50 px-4 py-2">
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
              {transactions.map((t) => (
                <li key={t.id} className="py-1.5 flex justify-between gap-2">
                  <span className="text-slate-500">{t.date}</span>
                  <span className="text-slate-700 flex-1 truncate px-2">
                    {t.place}
                    {t.proj && <span className="text-slate-400"> · {t.proj}</span>}
                  </span>
                  {t.memo && (
                    <span
                      title={t.memo}
                      className="text-xs rounded-full bg-violet-50 text-violet-600 px-1.5 py-0.5 shrink-0"
                    >
                      메모
                    </span>
                  )}
                  <span className="text-slate-900 font-medium shrink-0">{won(t.amount)}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
