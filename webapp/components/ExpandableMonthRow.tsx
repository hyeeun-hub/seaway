"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { won } from "@/lib/format";
import type { ProjectPnlRow, AdminCategoryRow } from "@/lib/aggregate";

export function ExpandableMonthRow({
  month,
  revenue,
  cost,
  profit,
  derived,
  derivedBreakdown,
  realProfit,
  marginRate,
  diff,
  isSelected,
  projects,
  adminRows,
}: {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
  derived: number;
  derivedBreakdown: { labor: number; interest: number; depreciation: number } | null;
  realProfit: number;
  marginRate: number | null;
  diff: number | null;
  isSelected: boolean;
  projects: ProjectPnlRow[];
  adminRows: AdminCategoryRow[];
}) {
  const [open, setOpen] = useState(false);

  const projectCostTotal = projects.reduce((s, p) => s + p.cost, 0);
  const adminTotal = adminRows.reduce((s, r) => s + r.amount, 0);
  // 프로젝트 원가 + 일반관리비로 안 잡히는 나머지(미분류 잔차 등) — 회계 항등식이라
  // 세 값을 더하면 반드시 그 달 매입액과 원 단위로 정확히 같아야 한다.
  const otherCost = cost - projectCostTotal - adminTotal;

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-slate-50 ${isSelected ? "bg-blue-50/40" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-2.5 pr-4 text-slate-700 font-medium">
          <span className="inline-flex items-center gap-1.5">
            {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
            {month}
          </span>
          {revenue === 0 && (
            <span
              className="ml-1.5 text-xs text-orange-600"
              title="매출이 없었다는 뜻이 아니라, 매출 데이터가 아직 입력되지 않았을 수 있습니다"
            >
              ⚠ 매출 미입력?
            </span>
          )}
        </td>
        <td className="py-2.5 pr-4 text-right text-slate-700">{won(revenue)}</td>
        <td className="py-2.5 pr-4 text-right text-slate-700">{won(cost)}</td>
        <td className={`py-2.5 pr-4 text-right font-semibold ${profit < 0 ? "text-red-600" : "text-emerald-700"}`}>
          {won(profit)}
        </td>
        <td className="py-2.5 pr-4 text-right text-slate-500">
          {marginRate !== null ? `${marginRate.toFixed(1)}%` : "—"}
        </td>
        <td className="py-2.5 pr-4 text-right text-slate-500">{derived > 0 ? `−${won(derived)}` : "—"}</td>
        <td className={`py-2.5 pr-4 text-right font-semibold ${realProfit < 0 ? "text-red-600" : "text-blue-700"}`}>
          {won(realProfit)}
        </td>
        <td
          className={`py-2.5 text-right font-medium ${
            diff === null ? "text-slate-400" : diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-slate-500"
          }`}
        >
          {diff === null ? "—" : `${diff > 0 ? "+" : ""}${won(diff)}`}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500 mb-2">이 달의 근거</p>

            {projects.length > 0 ? (
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-200">
                      <th className="py-1 pr-3 font-medium">프로젝트</th>
                      <th className="py-1 pr-3 font-medium text-right">매출</th>
                      <th className="py-1 pr-3 font-medium text-right">매입</th>
                      <th className="py-1 font-medium text-right">손익</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...projects]
                      .sort((a, b) => b.profit - a.profit)
                      .map((p) => (
                        <tr key={p.proj}>
                          <td className="py-1.5 pr-3 text-slate-700">
                            {p.proj}
                            {p.isPassThrough && (
                              <span className="ml-1.5 text-amber-600" title="매출=매입, 통과거래 의심">
                                (통과거래 의심)
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-slate-600">{won(p.revenue)}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-600">{won(p.cost)}</td>
                          <td className={`py-1.5 text-right font-medium ${p.profit < 0 ? "text-red-600" : "text-slate-800"}`}>
                            {won(p.profit)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-3">이 달 매출·매입이 잡힌 프로젝트가 없습니다.</p>
            )}

            <p className="text-xs text-slate-500">
              매입액 {won(cost)} = 프로젝트 원가 {won(projectCostTotal)} + 일반관리비{" "}
              <Link href="/admin-costs" className="text-blue-600 hover:underline">
                {won(adminTotal)}
              </Link>
              {otherCost !== 0 && (
                <>
                  {" "}
                  + 기타(검수 대기·미분류){" "}
                  <Link href="/review" className="text-blue-600 hover:underline">
                    {won(otherCost)}
                  </Link>
                </>
              )}
            </p>

            {derivedBreakdown && derived > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                파생원가 {won(derived)} = 인건비 {won(derivedBreakdown.labor)} + 이자 {won(derivedBreakdown.interest)} +
                감가상각 {won(derivedBreakdown.depreciation)}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
