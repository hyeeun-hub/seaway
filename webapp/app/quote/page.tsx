import Link from "next/link";
import { Card } from "@/components/Card";
import { prisma } from "@/lib/prisma";
import { getOverheadBaseline, countConcurrentProjects } from "@/lib/quoteSimulator";
import { getDerivedCostSummary } from "@/lib/aggregate";
import { QuoteSimulatorClient } from "@/components/QuoteSimulatorClient";
import { simulateQuote, type SimulateQuoteInput } from "./actions";

export const dynamic = "force-dynamic";

function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, "0")}`;
}

const DEFAULT_DURATION_MONTHS = 5;

export default async function QuotePage() {
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startYm = addMonths(currentYm, 1);
  const endYm = addMonths(startYm, DEFAULT_DURATION_MONTHS - 1);

  const [derivedSummary, loanCount, assetCount, concurrent] = await Promise.all([
    getDerivedCostSummary(),
    prisma.loan.count(),
    prisma.asset.count(),
    countConcurrentProjects(startYm, endYm),
  ]);

  // DerivedCost가 아직 한 번도 계산되지 않았으면(업로드 직후, 재계산 버튼을 누르기 전)
  // getOverheadBaseline()이 던진다 — 이 화면 전체를 500으로 죽이지 않고 안내로 대체한다.
  let baseline: Awaited<ReturnType<typeof getOverheadBaseline>> | null = null;
  try {
    baseline = await getOverheadBaseline();
  } catch {
    baseline = null;
  }

  if (!baseline) {
    return (
      <div className="p-6">
        <Card>
          <h1 className="text-sm font-semibold text-slate-900">수주 판단을 아직 열 수 없습니다</h1>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            월 고정비 기준선을 계산하려면 파생원가(인건비·이자·감가상각) 데이터가 필요합니다.{" "}
            <Link href="/settings?tab=master" className="text-blue-600 underline">
              설정 → 마스터 데이터
            </Link>{" "}
            탭에서 &quot;파생원가 재계산&quot;을 한 번 실행한 뒤 이 화면을 다시 열어주세요.
          </p>
        </Card>
      </div>
    );
  }

  // 자동 계산값이 0이면(겹치는 진행 현장이 전혀 없는 경우) 기본값 제안이 곧바로
  // 에러 상태로 화면을 여는 셈이 되어 사용성이 나쁘다 — 이 기본값은 "제안"일 뿐이고
  // 사용자가 바로 조정 가능하므로 1로 시작한다. 계산 함수 자체는 그대로 0에서 에러를 던진다.
  const defaultInput: SimulateQuoteInput = {
    bidCenter: 750_000_000,
    directCostEstimate: 670_000_000,
    targetProfitRate: 0.1,
    durationMonths: DEFAULT_DURATION_MONTHS,
    concurrentProjects: concurrent.count > 0 ? concurrent.count : 1,
    bidMin: 700_000_000,
    bidMax: 800_000_000,
    bidStep: 10_000_000,
    materialCostRatio: 0.5,
    materialPriceChange: 0.1,
    delayMonths: 2,
  };

  const initialResult = await simulateQuote(defaultInput);

  return (
    <QuoteSimulatorClient
      initialInput={defaultInput}
      initialResult={initialResult}
      initialConcurrentBasis={concurrent.basis}
      initialConcurrentProjects={concurrent.projects}
      monthCount={baseline.monthCount}
      loanCount={loanCount}
      assetCount={assetCount}
      uncalculableLoans={derivedSummary.uncalculable}
    />
  );
}
