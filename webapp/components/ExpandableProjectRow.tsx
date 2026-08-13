"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { won } from "@/lib/format";
import { ConvertToAdminButton } from "@/components/ConvertToAdminButton";
import { ContractProgress } from "@/components/ContractProgress";
import type { ProjectPnlRow, ProjectTransactionRow } from "@/lib/aggregate";

export function ExpandableProjectRow({
  p,
  badge,
  transactions,
  isNew,
  firstMonth,
  unbilledRatio,
  isConstruction,
  contractAmt,
}: {
  p: ProjectPnlRow;
  badge: { text: string; className: string };
  transactions: ProjectTransactionRow[];
  isNew?: boolean;
  firstMonth?: string;
  unbilledRatio?: number; // 있으면 미청구 의심(0~1)
  isConstruction?: boolean;
  contractAmt?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const barColor = p.profit > 0 ? "bg-blue-500" : p.profit < 0 ? "bg-red-500" : "bg-slate-300";

  return (
    <>
      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen((v) => !v)}>
        <td className="py-2.5 px-3">
          <div className="flex items-start gap-2">
            <span className={`w-1 rounded-full self-stretch ${barColor}`} />
            <span className="pt-0.5">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-slate-800 font-medium">{p.proj}</p>
                {isNew && (
                  <span className="text-xs rounded-full bg-blue-50 text-blue-600 px-1.5 py-0.5 font-medium">
                    NEW{firstMonth ? ` · ${firstMonth}` : ""}
                  </span>
                )}
              </div>
              {p.counterparty && <p className="text-xs text-slate-400">{p.counterparty}</p>}
              {p.isPassThrough && <p className="text-xs text-amber-600">통과거래 의심</p>}
              {unbilledRatio !== undefined && (
                <p className="text-xs text-red-600 font-medium">
                  ⚠️ 미청구 의심 ({(unbilledRatio * 100).toFixed(1)}%)
                </p>
              )}
              <ConvertToAdminButton proj={p.proj} />
            </div>
          </div>
        </td>
        <td className="py-2.5 px-3 text-right text-slate-700">{won(p.revenue)}</td>
        <td className="py-2.5 px-3 text-right text-slate-700">{won(p.costTaxInvoice)}</td>
        <td className="py-2.5 px-3 text-right text-slate-700">{won(p.costReceipt)}</td>
        <td
          className={`py-2.5 px-3 text-right font-semibold ${
            p.profit < 0 ? "text-red-600" : "text-slate-900"
          }`}
        >
          {won(p.profit)}
        </td>
        <td className="py-2.5 px-3 text-right">
          <span className={`text-xs rounded-full px-2 py-1 font-medium ${badge.className}`}>{badge.text}</span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-4 py-2">
            {unbilledRatio !== undefined && (
              <div className="mb-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                <p className="font-medium">⚠️ 미청구 의심</p>
                <p className="mt-0.5">
                  투입원가 {won(p.cost)} 대비 청구액이 {won(p.revenue)}({(unbilledRatio * 100).toFixed(1)}%)에
                  불과합니다. 기성 청구 여부를 확인해 주세요.
                </p>
              </div>
            )}
            {isConstruction && (
              <div className="mb-2 rounded-lg bg-white border border-slate-100 px-3 py-2">
                <ContractProgress
                  projectName={p.proj}
                  contractAmt={contractAmt ?? null}
                  revenue={p.revenue}
                  cost={p.cost}
                />
              </div>
            )}
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
              {transactions.map((t) => (
                <li key={t.id} className="py-1.5 flex justify-between gap-2">
                  <span className="text-slate-500 shrink-0">{t.date}</span>
                  <span
                    className={`text-xs rounded-full px-1.5 py-0.5 shrink-0 font-medium ${
                      t.side === "매출" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                    }`}
                  >
                    {t.side}
                  </span>
                  <span className="text-slate-700 flex-1 truncate px-2">{t.place}</span>
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
              {transactions.length === 0 && (
                <li className="py-2 text-slate-400">표시할 거래가 없습니다</li>
              )}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
