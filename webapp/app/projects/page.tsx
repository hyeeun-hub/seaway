import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { ExpandableProjectRow } from "@/components/ExpandableProjectRow";
import { won, monthLabel, signedWon } from "@/lib/format";
import {
  getProjectPnl,
  getMonthlyPnl,
  getReviewSummary,
  getProjectTransactions,
  getNewProjects,
  getDerivedCostByMonth,
  getAdminCategoryBreakdown,
  getUnclassifiedResidual,
  getUnbilledCompletionAlerts,
} from "@/lib/aggregate";
import type { ProjectPnlRow } from "@/lib/aggregate";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type FilterKey = "all" | "profit" | "loss" | "neutral";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "profit", label: "흑자" },
  { key: "loss", label: "적자" },
  { key: "neutral", label: "무손익" },
];

function matchesFilter(p: ProjectPnlRow, filter: FilterKey): boolean {
  if (filter === "profit") return p.profit > 0;
  if (filter === "loss") return p.profit < 0;
  if (filter === "neutral") return p.profit === 0;
  return true;
}

function statusBadge(p: ProjectPnlRow) {
  // 매출 0원 프로젝트는 이익률이 정의되지 않는다(분모 0) — "0.0%"로 표시하지 않고 "—".
  const marginText = p.revenue > 0 ? `${((p.profit / p.revenue) * 100).toFixed(1)}%` : "—";
  if (p.profit > 0) return { text: `흑자 ${marginText}`, className: "bg-emerald-50 text-emerald-600" };
  if (p.profit < 0) return { text: `적자 ${marginText}`, className: "bg-red-50 text-red-600" };
  return { text: `무손익 ${marginText}`, className: "bg-slate-100 text-slate-500" };
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; filter?: string }>;
}) {
  const [monthlyRows, reviewSummary, { month: requestedMonth, filter: requestedFilter }] =
    await Promise.all([getMonthlyPnl(), getReviewSummary(), searchParams]);

  const months = monthlyRows.map((m) => m.month);
  const selectedMonth = requestedMonth && months.includes(requestedMonth) ? requestedMonth : months.at(-1);
  const filter: FilterKey = FILTERS.some((f) => f.key === requestedFilter)
    ? (requestedFilter as FilterKey)
    : "all";

  const pnlOptions = selectedMonth ? { upToMonth: selectedMonth } : undefined;
  const [
    projectRows,
    txByProj,
    newProjects,
    derivedByMonth,
    adminRows,
    unclassified,
    unbilledAlerts,
    projectMasters,
  ] = await Promise.all([
    getProjectPnl(pnlOptions),
    getProjectTransactions(pnlOptions),
    getNewProjects(),
    getDerivedCostByMonth(),
    getAdminCategoryBreakdown(pnlOptions),
    getUnclassifiedResidual(pnlOptions),
    getUnbilledCompletionAlerts(pnlOptions),
    prisma.project.findMany({ select: { projectName: true, category: true, contractAmt: true } }),
  ]);
  const newProjectMap = new Map(newProjects.projects.map((n) => [n.proj, n.firstMonth]));
  const unbilledMap = new Map(unbilledAlerts.map((a) => [a.proj, a.ratio]));
  const masterByName = new Map(
    projectMasters.map((m) => [
      m.projectName,
      { category: m.category, contractAmt: m.contractAmt !== null ? Number(m.contractAmt) : null },
    ]),
  );

  // 전사 손익(변동비 기준, upToMonth 누적) — 기존 로직 그대로, 프로젝트별 손익 합계와
  // 다른 이유(일반관리비, 미분류 잔차)를 보여주기 위한 비교값이다.
  const upToSelectedMonthly = selectedMonth
    ? monthlyRows.filter((m) => m.month <= selectedMonth)
    : monthlyRows;
  const companyWideProfit = upToSelectedMonthly.reduce((s, m) => s + m.profit, 0);
  const allProjectsProfit = projectRows.reduce((s, p) => s + p.profit, 0);
  const adminSum = adminRows.reduce((s, r) => s + r.amount, 0);
  // 검사 A가 잡아낸 사각지대: proj 공백 + 일반관리비 아님 + 검수 대기. 프로젝트 화면에도
  // 관리비 화면에도 안 보이지만 전사 손익에는 포함되는 금액이라 여기 명시적으로 보여준다.
  const unclassifiedAmount = unclassified.amount;

  // 파생원가(인건비·이자·감가상각) — 프로젝트에 배부하지 않는다. L04 이자만 유일한 예외로
  // Transaction 단계 없이 이미 getProjectPnl과 무관하게 별도 표시만 한다.
  const derivedUpToSelected = selectedMonth
    ? derivedByMonth.filter((d) => d.month <= selectedMonth)
    : derivedByMonth;
  const derivedTotal = derivedUpToSelected.reduce((s, d) => s + d.total, 0);
  const realCompanyProfit = companyWideProfit - derivedTotal;
  const counts = {
    all: projectRows.length,
    profit: projectRows.filter((p) => p.profit > 0).length,
    loss: projectRows.filter((p) => p.profit < 0).length,
    neutral: projectRows.filter((p) => p.profit === 0).length,
  };
  const filteredRows = projectRows.filter((p) => matchesFilter(p, filter));

  const totals = filteredRows.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenue,
      costTaxInvoice: acc.costTaxInvoice + p.costTaxInvoice,
      costReceipt: acc.costReceipt + p.costReceipt,
      profit: acc.profit + p.profit,
    }),
    { revenue: 0, costTaxInvoice: 0, costReceipt: 0, profit: 0 },
  );

  const monthQuery = selectedMonth ? `month=${selectedMonth}` : "";

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="프로젝트별 손익"
        subtitle={`매출·매입 대비 프로젝트 단위 손익 · ${selectedMonth ? monthLabel(selectedMonth) : "—"} 기준`}
        months={months}
        selectedMonth={selectedMonth}
        basePath="/projects"
        reviewCount={reviewSummary.needsReview}
      />

      {newProjects.projects.length > 0 && (
        <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
          이번 업로드({newProjects.latestFileName})로 새로 등록된 프로젝트{" "}
          {newProjects.projects.length}개
        </p>
      )}

      {unbilledAlerts.length > 0 && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          ⚠️ 미청구 의심 현장 {unbilledAlerts.length}개 · 투입원가 합계{" "}
          {won(unbilledAlerts.reduce((s, a) => s + a.cost, 0))} — 공사는 진행했으나 기성 청구가
          안 됐을 가능성이 있습니다. 아래 목록에서 해당 프로젝트 행을 펼쳐 확인하세요.
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-sm">
          {FILTERS.map((f) => (
            <a
              key={f.key}
              href={`/projects?${monthQuery}${monthQuery ? "&" : ""}filter=${f.key}`}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                filter === f.key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-200/60"
              }`}
            >
              {f.label} {counts[f.key]}
            </a>
          ))}
        </div>
        <p className="text-xs text-slate-400">단위: 원 · 손익 = 매출액 - 매입액 합계</p>
      </div>

      <Card padding="py-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2.5 px-3 font-medium">프로젝트명</th>
                <th className="py-2.5 px-3 font-medium text-right">매출액</th>
                <th className="py-2.5 px-3 font-medium text-right">매입액(세금계산서)</th>
                <th className="py-2.5 px-3 font-medium text-right">매입액(간이영수증)</th>
                <th className="py-2.5 px-3 font-medium text-right">손익 ▼</th>
                <th className="py-2.5 px-3 font-medium text-right">구분·이익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRows.map((p) => {
                const master = masterByName.get(p.proj);
                return (
                  <ExpandableProjectRow
                    key={p.proj}
                    p={p}
                    badge={statusBadge(p)}
                    transactions={txByProj.get(p.proj) ?? []}
                    isNew={newProjectMap.has(p.proj)}
                    firstMonth={newProjectMap.get(p.proj)}
                    unbilledRatio={unbilledMap.get(p.proj)}
                    isConstruction={master?.category === "공사"}
                    contractAmt={master?.contractAmt ?? null}
                  />
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 px-3 text-slate-400">
                    조건에 맞는 프로젝트가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="py-2.5 px-3 text-slate-700">합계 · {filteredRows.length}개 프로젝트</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">{won(totals.revenue)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">{won(totals.costTaxInvoice)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">{won(totals.costReceipt)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700">{won(totals.profit)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          전사 손익까지 이어보기 · {selectedMonth ? monthLabel(selectedMonth) : "—"} 기준 누적
        </h2>
        <div className="text-sm space-y-1.5 max-w-lg">
          <div className="flex justify-between">
            <span className="text-slate-600">프로젝트별 손익 합계 ({projectRows.length}개)</span>
            <span className="font-medium text-slate-900">{won(allProjectsProfit)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <Link href="/admin-costs" className="pl-3 hover:underline">
              일반관리비
            </Link>
            <span>−{won(adminSum)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <Link href="/review" className="pl-3 hover:underline" title="프로젝트 미지정 + 일반관리비 아님 + 검수 대기 거래">
              미분류 (검수 대기){unclassified.count === 0 && " — 미확정 금액 없음"}
            </Link>
            <span>{unclassifiedAmount === 0 ? won(0) : signedWon(unclassifiedAmount)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-medium">
            <span className="text-slate-700">전사 변동비 기준 손익</span>
            <span className="text-slate-900">{won(companyWideProfit)}</span>
          </div>

          <div className="pl-3 pt-1 space-y-1 text-red-600">
            <div className="flex justify-between">
              <span>인건비</span>
              <span>
                −{won(derivedUpToSelected.reduce((s, d) => s + d.labor, 0))}
              </span>
            </div>
            <div className="flex justify-between">
              <span>이자</span>
              <span>−{won(derivedUpToSelected.reduce((s, d) => s + d.interest, 0))}</span>
            </div>
            <div className="flex justify-between">
              <span>감가상각</span>
              <span>−{won(derivedUpToSelected.reduce((s, d) => s + d.depreciation, 0))}</span>
            </div>
          </div>

          <div className="flex justify-between border-t border-slate-200 pt-1.5">
            <span className="font-semibold text-slate-900">전사 손익</span>
            <span className={`font-bold ${realCompanyProfit < 0 ? "text-red-600" : "text-slate-900"}`}>
              {won(realCompanyProfit)}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          파생원가는 프로젝트별로 배부하지 않았습니다. 인건비는 근태 데이터가 없어 배부 근거가
          없고, 이자·감가상각은 대부분 전사 자금·자산입니다. 유일한 예외는 추자 예초
          해상부유구조물 전용 대출(L04)의 이자 1,733,330원으로, 위 인건비/이자/감가상각
          전사 합계에는 포함돼 있지만 어느 프로젝트의 것인지는 여기서 구분해 배부하지 않았습니다
          (배부 기준은 다음 단계에서 정합니다).
        </p>
      </Card>
    </div>
  );
}
