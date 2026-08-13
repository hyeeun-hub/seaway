import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { KpiCard } from "@/components/KpiCard";
import { Card } from "@/components/Card";
import { UploadCard } from "@/components/UploadCard";
import { RevenueRealProfitChart } from "@/components/RevenueRealProfitChart";
import { PageHeader } from "@/components/PageHeader";
import { won, shortWon, signedWon, monthLabel } from "@/lib/format";
import {
  getProjectPnl,
  getMonthlyPnl,
  getReviewSummary,
  getPurchaseKindBreakdown,
  getDerivedCostByMonth,
  getDerivedCostSummary,
  getUnbilledCompletionAlerts,
} from "@/lib/aggregate";
import { getCalendarEntries, todayInKorea } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [monthlyRows, { month: requestedMonth }] = await Promise.all([
    getMonthlyPnl(),
    searchParams,
  ]);

  const months = monthlyRows.map((m) => m.month);
  // 이 제품의 핵심 메시지는 "기간을 넓게 보면 변동비 기준 흑자가 파생원가(인건비·이자·
  // 감가상각) 반영 시 적자로 뒤집힌다"는 것이다 — 최근 1개월만 기본으로 보여주면 이 메시지가
  // 가려진다. 그래서 기본값을 전체 기간으로 두고, 월 선택은 그대로 유지한다.
  const requestedIsValid = requestedMonth === "all" || (requestedMonth && months.includes(requestedMonth));
  const selectedDropdownValue = requestedIsValid ? requestedMonth! : "all";
  const isAllPeriod = selectedDropdownValue === "all";
  const selectedMonth = isAllPeriod ? undefined : selectedDropdownValue;
  const dropdownMonths = ["all", ...months];

  const [projectRows, reviewSummary, purchaseByKind, calendarEntries, derivedByMonth, derivedSummary, unbilledAlerts] =
    await Promise.all([
      getProjectPnl(selectedMonth ? { upToMonth: selectedMonth } : undefined),
      getReviewSummary(),
      getPurchaseKindBreakdown(),
      getCalendarEntries(),
      getDerivedCostByMonth(),
      getDerivedCostSummary(),
      getUnbilledCompletionAlerts(selectedMonth ? { upToMonth: selectedMonth } : undefined),
    ]);

  const upToSelected = selectedMonth
    ? monthlyRows.filter((m) => m.month <= selectedMonth)
    : monthlyRows;
  const chartRows = upToSelected.slice(-6);
  const selectedRow = upToSelected.at(-1); // upToSelected의 마지막 = 선택월 그 자체(월 선택 시)
  const prevRow = upToSelected.at(-2);

  // 누적(1월~선택월, 전체 기간이면 1월~5월 전부) — 항상 이 값이 진짜 총합이다.
  const totalRevenue = upToSelected.reduce((s, m) => s + m.revenue, 0);
  const totalCost = upToSelected.reduce((s, m) => s + m.cost, 0);
  const totalProfit = totalRevenue - totalCost;

  // 선택 범위의 대표 수치 — 특정 월을 골랐으면 그 달 단독 값, 전체 기간이면 누적 총합.
  const selectedRevenue = isAllPeriod ? totalRevenue : selectedRow?.revenue ?? 0;
  const selectedCost = isAllPeriod ? totalCost : selectedRow?.cost ?? 0;
  const selectedProfit = isAllPeriod ? totalProfit : selectedRow?.profit ?? 0;

  // 파생원가(인건비·이자·감가상각) — 선택 범위 단독, 그리고 1월~선택월 누적.
  const derivedUpToSelected = selectedMonth
    ? derivedByMonth.filter((d) => d.month <= selectedMonth)
    : derivedByMonth;
  const derivedOf = (month?: string) => derivedByMonth.find((d) => d.month === month)?.total ?? 0;
  const derivedTotalCumulative = derivedUpToSelected.reduce((s, d) => s + d.total, 0);
  const derivedTotalSelected = isAllPeriod ? derivedTotalCumulative : derivedOf(selectedMonth);
  const derivedComponent = (field: "labor" | "interest" | "depreciation") =>
    isAllPeriod
      ? derivedUpToSelected.reduce((s, d) => s + d[field], 0)
      : derivedByMonth.find((d) => d.month === selectedMonth)?.[field] ?? 0;
  const laborSelected = derivedComponent("labor");
  const interestSelected = derivedComponent("interest");
  const depreciationSelected = derivedComponent("depreciation");

  // "분석 결과 손익" — 매출-매입에 인건비·이자·감가상각까지 반영한 하나의 최종 숫자만 보여준다.
  const realProfitSelected = selectedProfit - derivedTotalSelected;
  const realProfitCumulative = totalProfit - derivedTotalCumulative;
  // 매출 0원 기간은 이익률이 정의되지 않는다(분모 0) — %를 계산하지 않고 "—"로 표시한다.
  const realMarginRate = selectedRevenue > 0 ? (realProfitSelected / selectedRevenue) * 100 : null;
  // "이 달은..." 문구는 특정 월을 골랐을 때만 의미가 있다 — 전체 기간엔 "이 달"이 없다.
  const isLossMonth = !isAllPeriod && realProfitSelected < 0;
  // 전월 대비는 증가율(%)이 아니라 금액 차이로 표시한다 — 기준월이 적자/0이면
  // 증가율 자체가 의미 없는 숫자가 나오기 때문(예: 04월 적자 대비 +317.6% 같은 착시).
  // 전체 기간 선택 시에는 "전월"이 없으므로 표시하지 않는다.
  const momDiff =
    !isAllPeriod && prevRow ? realProfitSelected - (prevRow.profit - derivedOf(prevRow.month)) : null;

  const projectsWithRevenue = projectRows.filter((p) => p.revenue > 0).length;
  const profitableCount = projectRows.filter((p) => p.profit > 0).length;
  const lossCount = projectRows.filter((p) => p.profit < 0).length;
  const neutralCount = projectRows.filter((p) => p.profit === 0).length;

  const topProjects = [...projectRows]
    .filter((p) => p.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);
  const lossProjects = [...projectRows]
    .filter((p) => p.profit < 0)
    .sort((a, b) => a.profit - b.profit);

  const taxInvoiceCost = purchaseByKind["매입-세금계산서"] ?? 0;
  const receiptCost = purchaseByKind["매입-간이영수증"] ?? 0;

  const today = todayInKorea();
  const currentMonth = today.slice(0, 7);
  const monthNum = Number(currentMonth.slice(5, 7));
  const upcoming = calendarEntries
    .filter((e) => e.settleDate.startsWith(currentMonth) && e.side === "매출")
    .sort((a, b) => a.settleDate.localeCompare(b.settleDate))
    .slice(0, 6);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="대시보드"
        subtitle={`ERP 원장 기반 손익 분석 현황 · ${monthLabel(selectedDropdownValue)} 기준`}
        months={dropdownMonths}
        selectedMonth={selectedDropdownValue}
        reviewCount={reviewSummary.needsReview}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="총 매출"
          value={won(selectedRevenue)}
          sublabel={isAllPeriod ? `매출원장 ${projectsWithRevenue}개 프로젝트` : `누적 ${won(totalRevenue)} · 매출원장 ${projectsWithRevenue}개 프로젝트`}
        />
        <KpiCard
          label="총 매입"
          value={won(selectedCost)}
          sublabel={
            isAllPeriod
              ? `세금계산서 ${shortWon(taxInvoiceCost)} · 간이 ${shortWon(receiptCost)}`
              : `누적 ${won(totalCost)} · 세금계산서 ${shortWon(taxInvoiceCost)} · 간이 ${shortWon(receiptCost)}`
          }
        />
        <KpiCard
          label="분석 결과 손익"
          value={won(realProfitSelected)}
          variant={realProfitSelected < 0 ? "alert" : "default"}
          sublabel={
            <>
              매출−매입에 이자·감가상각·인건비 반영(더미 데이터 예시)
              {!isAllPeriod && <> · 누적 {won(realProfitCumulative)}</>}
              {" · "}이익률 {realMarginRate !== null ? `${realMarginRate.toFixed(1)}%` : "—"}
              {momDiff !== null && <> · 전월 대비 {signedWon(momDiff)}</>}
            </>
          }
        />
        <KpiCard
          label="프로젝트 수"
          value={`${projectRows.length}개`}
          sublabel={`${isAllPeriod ? "전체 기간" : `누적(~${monthLabel(selectedMonth!)})`} · 흑자 ${profitableCount} / 적자 ${lossCount} / 무손익 ${neutralCount}`}
        />
      </div>

      <details className="group rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-4 py-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">변동비 기준 손익 {won(selectedProfit)}</span>
            <span className="text-slate-400">→</span>
            <span className={`font-semibold ${realProfitSelected < 0 ? "text-red-600" : "text-slate-900"}`}>
              진짜 손익 {won(realProfitSelected)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
            차이 구성 보기
            <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 text-sm space-y-1.5 max-w-lg">
          <div className="flex justify-between text-slate-600">
            <span>변동비 기준 손익{isAllPeriod ? " (전체 기간)" : ""}</span>
            <span className="font-medium text-slate-900">{won(selectedProfit)}</span>
          </div>
          <div className="pl-3 space-y-1 text-red-600">
            <div className="flex justify-between">
              <span>인건비</span>
              <span>−{won(laborSelected)}</span>
            </div>
            <div className="flex justify-between">
              <span>이자</span>
              <span>−{won(interestSelected)}</span>
            </div>
            <div className="flex justify-between">
              <span>감가상각</span>
              <span>−{won(depreciationSelected)}</span>
            </div>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold">
            <span className="text-slate-900">진짜 손익</span>
            <span className={realProfitSelected < 0 ? "text-red-600" : "text-slate-900"}>
              {won(realProfitSelected)}
            </span>
          </div>
          {derivedSummary.uncalculable.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-2">
              ⚠ {derivedSummary.uncalculable.map((u) => u.loanCode).join(", ")} 대출은 연이율이
              등록되지 않아 이자 계산에서 제외됐습니다.
            </p>
          )}
        </div>
      </details>

      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          realProfitSelected < 0
            ? "bg-red-50 border-red-100 text-red-700"
            : "bg-slate-50 border-slate-200 text-slate-600"
        }`}
      >
        <p className="font-medium">
          {realProfitSelected < 0 ? "⚠️" : "ℹ️"} 진짜 손익 {won(realProfitSelected)}
        </p>
        <p className="mt-0.5">
          다음 공사에서 같은 일이 생기지 않게 →{" "}
          <Link href="/quote" className="font-semibold underline">
            수주 판단하기
          </Link>
        </p>
      </div>

      {!isAllPeriod && selectedRevenue === 0 && (
        <p className="text-sm text-orange-800 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
          ⚠️ 이 달은 매출 데이터가 0건입니다. <strong>실제로 매출이 없었다는 뜻이 아니라</strong>,
          매출 세금계산서 등 원본 자료가 아직 시스템에 입력되지 않았을 가능성이 있습니다. 원본
          업로드 여부를 확인해 주세요.
        </p>
      )}
      {isLossMonth && (
        <p className="text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          {selectedRevenue === 0 ? (
            <>
              이 달은 매출 청구가 없어 적자로 표시됩니다. 공사 원가는 발생했으나 기성 청구가
              이루어지지 않은 상태입니다.
            </>
          ) : (
            <>
              이 달은 원가가 매출을 초과했습니다. 진행 중인 공사의 기성 청구 시점과 원가 발생
              시점이 달라 발생할 수 있습니다.
            </>
          )}
        </p>
      )}
      {unbilledAlerts.length > 0 && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <Link href="/projects" className="hover:underline">
            ⚠️ 미청구 의심 현장 {unbilledAlerts.length}개 · 투입원가 합계{" "}
            {won(unbilledAlerts.reduce((s, a) => s + a.cost, 0))}
          </Link>{" "}
          — 공사는 진행했으나 기성 청구가 안 됐을 가능성이 있습니다. 프로젝트별 손익 화면에서
          확인하세요.
        </p>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card
          title="최근 6개월 손익 추이"
          subtitle="단위: 백만원"
          action={
            <Link
              href="/monthly"
              className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
            >
              월별 추이 전체보기 <ArrowRight size={12} />
            </Link>
          }
          className="lg:col-span-2"
        >
          <RevenueRealProfitChart
            basePath="/monthly"
            data={chartRows.map((m) => {
              const d = derivedByMonth.find((x) => x.month === m.month);
              const realProfitWon = m.profit - (d?.total ?? 0);
              return {
                label: `${m.month.slice(5, 7)}월`,
                month: m.month,
                revenue: Math.round(m.revenue / 1_000_000),
                realProfit: Math.round(realProfitWon / 1_000_000),
                revenueWon: m.revenue,
                realProfitWon,
              };
            })}
          />
        </Card>

        <div id="upload">
          <UploadCard
            statusText={`분석 완료 · 거래 ${
              projectRows.reduce((s, p) => s + (p.revenue > 0 ? 1 : 0), 0)
            }개 프로젝트 반영 · 검수 ${reviewSummary.needsReview}건 남음`}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card
          title="손익 상위 프로젝트"
          action={
            <Link href="/projects" className="text-xs text-slate-500 hover:text-slate-700">
              전체
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100">
            {topProjects.map((p) => (
              <li key={p.proj} className="py-2 flex justify-between text-sm">
                <span className="text-slate-600 truncate pr-2">{p.proj}</span>
                <span className="font-medium text-slate-900 shrink-0">{won(p.profit)}</span>
              </li>
            ))}
            {topProjects.length === 0 && (
              <li className="py-2 text-sm text-slate-400">데이터가 없습니다</li>
            )}
          </ul>
        </Card>

        <Card
          title="적자 프로젝트"
          action={<span className="text-xs text-slate-400">{lossProjects.length}건</span>}
        >
          <ul className="divide-y divide-slate-100">
            {lossProjects.map((p) => (
              <li key={p.proj} className="py-2 flex justify-between text-sm">
                <span className="text-slate-600 truncate pr-2">{p.proj}</span>
                <span className="font-medium text-red-600 shrink-0">{won(p.profit)}</span>
              </li>
            ))}
            {lossProjects.length === 0 && (
              <li className="py-2 text-sm text-slate-400">적자 프로젝트가 없습니다</li>
            )}
          </ul>
        </Card>

        <Card
          title={`${monthNum}월 회수 예정`}
          action={
            <Link href="/calendar" className="text-xs text-slate-500 hover:text-slate-700">
              캘린더
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100">
            {upcoming.map((e, i) => (
              <li key={i} className="py-2 flex items-center gap-2 text-sm">
                <span className="text-slate-400 w-9 shrink-0">
                  {Number(e.settleDate.slice(5, 7))}/{Number(e.settleDate.slice(8, 10))}
                </span>
                <span className="text-slate-600 truncate flex-1">{e.place || e.proj}</span>
                <span
                  className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${
                    e.status === "확정" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {e.status}
                </span>
                <span className="font-medium text-slate-900 shrink-0 w-16 text-right">
                  {shortWon(e.amount)}
                </span>
              </li>
            ))}
            {upcoming.length === 0 && (
              <li className="py-2 text-sm text-slate-400">이번 달 회수 일정이 없습니다</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
