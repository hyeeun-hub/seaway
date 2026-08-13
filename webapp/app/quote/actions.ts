"use server";

import {
  computeAllocatedOverhead,
  computeBreakEven,
  evaluateQuote,
  scanBidRange,
  analyzeSensitivity,
  getOverheadBaseline,
  countConcurrentProjects,
  type AllocatedOverheadResult,
  type BreakEvenResult,
  type EvaluateQuoteResult,
  type ScanBidRangeResult,
  type AnalyzeSensitivityResult,
} from "@/lib/quoteSimulator";

// 화면(클라이언트)에서 lib/quoteSimulator.ts를 직접 import하면 그 파일이 참조하는
// prisma까지 클라이언트 번들에 끌려온다. 그래서 재계산은 전부 이 서버 액션을 거친다 —
// 계산 로직 자체는 4-a에서 검증된 lib/quoteSimulator.ts를 그대로 호출만 한다.

export interface SimulateQuoteInput {
  bidCenter: number; // 결과 패널에서 살펴볼 투찰금액(계약금액)
  directCostEstimate: number;
  targetProfitRate: number;
  durationMonths: number;
  concurrentProjects: number;
  bidMin: number;
  bidMax: number;
  bidStep: number;
  materialCostRatio: number;
  materialPriceChange: number;
  delayMonths: number;
}

export interface SimulateQuoteResult {
  error: string | null;
  monthlyLabor: number;
  monthlyInterest: number;
  monthlyDepreciation: number;
  monthlyCommonCost: number;
  overhead: AllocatedOverheadResult | null;
  breakEven: BreakEvenResult | null;
  quote: EvaluateQuoteResult | null;
  scan: ScanBidRangeResult | null;
  sensitivity: AnalyzeSensitivityResult | null;
}

const MAX_SCAN_ROWS = 300;

export async function simulateQuote(input: SimulateQuoteInput): Promise<SimulateQuoteResult> {
  const baseline = await getOverheadBaseline();
  const base = {
    monthlyLabor: baseline.monthlyLabor,
    monthlyInterest: baseline.monthlyInterest,
    monthlyDepreciation: baseline.monthlyDepreciation,
    monthlyCommonCost: baseline.monthlyCommonCost,
  };

  try {
    if (input.bidStep > 0 && (input.bidMax - input.bidMin) / input.bidStep > MAX_SCAN_ROWS) {
      throw new Error(
        `스캔 구간이 너무 세분화되어 있습니다(${MAX_SCAN_ROWS}행 초과) — 투찰 금액대 간격을 늘려주세요`,
      );
    }

    const overheadInput = {
      ...base,
      durationMonths: input.durationMonths,
      concurrentProjects: input.concurrentProjects,
    };
    const overhead = computeAllocatedOverhead(overheadInput);

    const breakEven = computeBreakEven({
      contractAmount: input.bidCenter,
      allocatedOverhead: overhead.allocatedTotal,
      targetProfitRate: input.targetProfitRate,
    });

    const quote = evaluateQuote({
      contractAmount: input.bidCenter,
      directCostEstimate: input.directCostEstimate,
      allocatedOverhead: overhead.allocatedTotal,
      targetProfitRate: input.targetProfitRate,
    });

    const scan = scanBidRange({
      min: input.bidMin,
      max: input.bidMax,
      step: input.bidStep,
      directCostEstimate: input.directCostEstimate,
      allocatedOverhead: overhead.allocatedTotal,
      targetProfitRate: input.targetProfitRate,
    });

    const sensitivity = analyzeSensitivity({
      base: {
        contractAmount: input.bidCenter,
        directCostEstimate: input.directCostEstimate,
        allocatedOverhead: overhead.allocatedTotal,
        targetProfitRate: input.targetProfitRate,
      },
      materialCostRatio: input.materialCostRatio,
      materialPriceChange: input.materialPriceChange,
      delayMonths: input.delayMonths,
      overheadInput,
    });

    return { error: null, ...base, overhead, breakEven, quote, scan, sensitivity };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      ...base,
      overhead: null,
      breakEven: null,
      quote: null,
      scan: null,
      sensitivity: null,
    };
  }
}

function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, "0")}`;
}

// 동시 진행 현장 수 "다시 계산" — 다음 달부터 durationMonths 개월을 기본 창으로 잡는다.
// Project 공기가 더미 값이라는 사실은 lib/quoteSimulator.ts의 basis 문구가 이미 명시한다.
export async function recalcConcurrentProjects(durationMonths: number) {
  if (durationMonths <= 0) {
    throw new Error("durationMonths는 1 이상이어야 합니다");
  }
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startYm = addMonths(currentYm, 1);
  const endYm = addMonths(startYm, durationMonths - 1);
  return countConcurrentProjects(startYm, endYm);
}
