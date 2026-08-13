import { prisma } from "@/lib/prisma";
import { getDerivedCostSummary, getAdminCategoryBreakdown } from "@/lib/aggregate";

// 이 파일은 "이미 발생한 손익이 왜 안 남았는지"를 보여주는 기존 화면과 같은 원리를
// 수주 전 판단에 적용한다. 과거 원가율로 미래 원가를 예측하지 않는다 — 현재 데이터는
// 매출·원가의 발생 시점이 어긋나 있어(수익비용대응) 신뢰할 수 있는 원가율을 낼 수
// 없다. 대신 회계 항등식(계약금액 − 배부 고정비 = 손익분기 직접원가)으로 역산한다.

// ===== 함수 1 — 배부 고정비 =====

export interface AllocatedOverheadInput {
  monthlyLabor: number; // 상시직 인건비(급여+4대보험+퇴직충당)
  monthlyInterest: number;
  monthlyDepreciation: number;
  monthlyCommonCost: number; // 공통고정비(일반관리비)
  durationMonths: number;
  concurrentProjects: number;
}

export interface AllocatedOverheadResult {
  monthlyTotal: number;
  allocatedTotal: number; // monthlyTotal × durationMonths ÷ concurrentProjects
  breakdown: { label: string; monthly: number; allocated: number }[];
}

export function computeAllocatedOverhead(input: AllocatedOverheadInput): AllocatedOverheadResult {
  const { monthlyLabor, monthlyInterest, monthlyDepreciation, monthlyCommonCost, durationMonths, concurrentProjects } =
    input;

  // 0 이하를 1로 보정하면 "동시 진행 현장이 없는데 배부율이 100%로 잡히는" 조용한
  // 왜곡이 생긴다 — 호출자가 잘못된 입력을 넣었다는 사실 자체를 드러내야 한다.
  if (concurrentProjects <= 0) {
    throw new Error("concurrentProjects는 1 이상이어야 합니다 (0 이하로 보정하지 않음)");
  }
  if (durationMonths <= 0) {
    throw new Error("durationMonths는 1 이상이어야 합니다");
  }

  const items = [
    { label: "인건비", monthly: monthlyLabor },
    { label: "이자", monthly: monthlyInterest },
    { label: "감가상각", monthly: monthlyDepreciation },
    { label: "공통고정비(일반관리비)", monthly: monthlyCommonCost },
  ];

  const monthlyTotal = items.reduce((s, i) => s + i.monthly, 0);
  const allocatedTotal = (monthlyTotal * durationMonths) / concurrentProjects;
  const breakdown = items.map((i) => ({
    label: i.label,
    monthly: i.monthly,
    allocated: (i.monthly * durationMonths) / concurrentProjects,
  }));

  return { monthlyTotal, allocatedTotal, breakdown };
}

// ===== 함수 2 — 손익분기 역산 =====

export interface BreakEvenInput {
  contractAmount: number;
  allocatedOverhead: number;
  targetProfitRate?: number; // 기본 0.10
}

export interface BreakEvenResult {
  breakEvenDirectCost: number; // 계약금액 − 배부액
  targetDirectCost: number; // 계약금액 − 배부액 − (계약금액 × 목표율)
  breakEvenCostRate: number; // breakEvenDirectCost ÷ contractAmount
  targetCostRate: number;
}

export function computeBreakEven({
  contractAmount,
  allocatedOverhead,
  targetProfitRate = 0.1,
}: BreakEvenInput): BreakEvenResult {
  if (contractAmount <= 0) {
    throw new Error("contractAmount는 0보다 커야 합니다");
  }

  const breakEvenDirectCost = contractAmount - allocatedOverhead;
  const targetDirectCost = breakEvenDirectCost - contractAmount * targetProfitRate;

  return {
    breakEvenDirectCost,
    targetDirectCost,
    breakEvenCostRate: breakEvenDirectCost / contractAmount,
    targetCostRate: targetDirectCost / contractAmount,
  };
}

// ===== 함수 3 — 견적 평가 =====

export interface EvaluateQuoteInput {
  contractAmount: number;
  directCostEstimate: number;
  allocatedOverhead: number;
  targetProfitRate?: number;
}

export interface EvaluateQuoteResult {
  contributionMargin: number; // "겉보기 이익" — 지금 ERP가 보여주는 숫자(배부 고정비 반영 전)
  contributionRate: number;
  actualProfit: number; // 겉보기 이익 − 배부액
  actualProfitRate: number;
  meetsTarget: boolean;
}

export function evaluateQuote({
  contractAmount,
  directCostEstimate,
  allocatedOverhead,
  targetProfitRate = 0.1,
}: EvaluateQuoteInput): EvaluateQuoteResult {
  if (contractAmount <= 0) {
    throw new Error("contractAmount는 0보다 커야 합니다");
  }

  const contributionMargin = contractAmount - directCostEstimate;
  const contributionRate = contributionMargin / contractAmount;
  const actualProfit = contributionMargin - allocatedOverhead;
  const actualProfitRate = actualProfit / contractAmount;

  return {
    contributionMargin,
    contributionRate,
    actualProfit,
    actualProfitRate,
    meetsTarget: actualProfitRate >= targetProfitRate,
  };
}

// ===== 함수 4 — 투찰 금액대 스캔 =====

export interface ScanBidRangeInput {
  min: number;
  max: number;
  step: number;
  directCostEstimate: number;
  allocatedOverhead: number;
  targetProfitRate?: number;
}

export interface ScanBidRow {
  bidAmount: number;
  actualProfit: number;
  actualProfitRate: number;
  meetsTarget: boolean;
}

export interface ScanBidRangeResult {
  rows: ScanBidRow[];
  minimumBidForTarget: number | null; // 목표 이익률을 처음 만족하는 최소 투찰금액
}

export function scanBidRange({
  min,
  max,
  step,
  directCostEstimate,
  allocatedOverhead,
  targetProfitRate = 0.1,
}: ScanBidRangeInput): ScanBidRangeResult {
  if (step <= 0) {
    throw new Error("step은 0보다 커야 합니다");
  }
  if (max < min) {
    throw new Error("max는 min보다 크거나 같아야 합니다");
  }

  const rows: ScanBidRow[] = [];
  let minimumBidForTarget: number | null = null;
  // min + i*step 형태로 계산해 반복 누산(+=)에서 생기는 부동소수점 드리프트를 피한다.
  const steps = Math.floor((max - min) / step + 1e-9);

  for (let i = 0; i <= steps; i++) {
    const bidAmount = min + i * step;
    const { actualProfit, actualProfitRate, meetsTarget } = evaluateQuote({
      contractAmount: bidAmount,
      directCostEstimate,
      allocatedOverhead,
      targetProfitRate,
    });
    rows.push({ bidAmount, actualProfit, actualProfitRate, meetsTarget });
    if (meetsTarget && minimumBidForTarget === null) minimumBidForTarget = bidAmount;
  }

  return { rows, minimumBidForTarget };
}

// ===== 함수 5 — 민감도 =====

export interface SensitivityBase {
  contractAmount: number;
  directCostEstimate: number;
  allocatedOverhead: number;
  targetProfitRate?: number;
}

export interface AnalyzeSensitivityInput {
  base: SensitivityBase;
  materialCostRatio: number; // 직접원가 중 자재비 비중(0~1)
  materialPriceChange: number; // 예: 0.1 = 자재비 +10%
  delayMonths: number;
  // 공기 지연 시 배부액을 다시 계산하려면(함수 1 재호출) 원래 배부 계산에 쓴 입력이
  // 그대로 필요하다 — base.allocatedOverhead는 이미 계산된 숫자라 durationMonths를
  // 알 수 없기 때문에 별도로 받는다.
  overheadInput: AllocatedOverheadInput;
}

export interface SensitivityScenario {
  label: string;
  actualProfit: number;
  actualProfitRate: number;
}

export interface AnalyzeSensitivityResult {
  scenarios: SensitivityScenario[];
}

export function analyzeSensitivity({
  base,
  materialCostRatio,
  materialPriceChange,
  delayMonths,
  overheadInput,
}: AnalyzeSensitivityInput): AnalyzeSensitivityResult {
  const scenarios: SensitivityScenario[] = [];

  const baseline = evaluateQuote(base);
  scenarios.push({
    label: "기준안",
    actualProfit: baseline.actualProfit,
    actualProfitRate: baseline.actualProfitRate,
  });

  const materialAdjustedCost = base.directCostEstimate * (1 + materialCostRatio * materialPriceChange);
  const materialScenario = evaluateQuote({ ...base, directCostEstimate: materialAdjustedCost });
  scenarios.push({
    label: `자재비 ${(materialPriceChange * 100).toFixed(0)}% 변동(비중 ${(materialCostRatio * 100).toFixed(0)}%)`,
    actualProfit: materialScenario.actualProfit,
    actualProfitRate: materialScenario.actualProfitRate,
  });

  // 공기 지연 — 함수 1을 durationMonths + delayMonths로 재호출해 배부액 증가를 반영한다.
  const delayedOverhead = computeAllocatedOverhead({
    ...overheadInput,
    durationMonths: overheadInput.durationMonths + delayMonths,
  });
  const delayScenario = evaluateQuote({ ...base, allocatedOverhead: delayedOverhead.allocatedTotal });
  scenarios.push({
    label: `공기 ${delayMonths}개월 지연`,
    actualProfit: delayScenario.actualProfit,
    actualProfitRate: delayScenario.actualProfitRate,
  });

  const combinedScenario = evaluateQuote({
    ...base,
    directCostEstimate: materialAdjustedCost,
    allocatedOverhead: delayedOverhead.allocatedTotal,
  });
  scenarios.push({
    label: `자재비 변동 + 공기 ${delayMonths}개월 지연 동시`,
    actualProfit: combinedScenario.actualProfit,
    actualProfitRate: combinedScenario.actualProfitRate,
  });

  return { scenarios };
}

// ===== 자동 계산 입력값 — DB에서 읽는다(하드코딩 금지) =====

export interface OverheadBaseline {
  monthlyLabor: number;
  monthlyInterest: number;
  monthlyDepreciation: number;
  monthlyCommonCost: number;
  monthCount: number; // 나눈 개월 수(DerivedCost의 distinct yearMonth 개수) — 검증용으로 함께 반환
  basis: string;
}

export async function getOverheadBaseline(): Promise<OverheadBaseline> {
  const [derivedSummary, adminRows, monthRows] = await Promise.all([
    getDerivedCostSummary(),
    getAdminCategoryBreakdown(),
    prisma.derivedCost.findMany({ select: { yearMonth: true }, distinct: ["yearMonth"] }),
  ]);

  const months = monthRows.map((r) => r.yearMonth).sort();
  const monthCount = months.length;
  if (monthCount === 0) {
    throw new Error("DerivedCost 데이터가 없어 월 고정비를 계산할 수 없습니다");
  }

  const commonCostTotal = adminRows.reduce((s, r) => s + r.amount, 0);
  const monthlyLabor = derivedSummary.labor / monthCount;
  const monthlyInterest = derivedSummary.interest / monthCount;
  const monthlyDepreciation = derivedSummary.depreciation / monthCount;
  const monthlyCommonCost = commonCostTotal / monthCount;

  const monthRange = monthCount === 1 ? months[0] : `${months[0]}~${months[monthCount - 1]}`;
  const basis =
    `DerivedCost ${monthRange}(${monthCount}개월) 기준 · ` +
    `인건비 합계 ${derivedSummary.labor.toLocaleString()}원 ÷ ${monthCount} · ` +
    `이자 합계 ${derivedSummary.interest.toLocaleString()}원 ÷ ${monthCount} · ` +
    `감가상각 합계 ${derivedSummary.depreciation.toLocaleString()}원 ÷ ${monthCount} · ` +
    `일반관리비 합계 ${commonCostTotal.toLocaleString()}원 ÷ ${monthCount}`;

  return { monthlyLabor, monthlyInterest, monthlyDepreciation, monthlyCommonCost, monthCount, basis };
}

// ===== 동시 진행 현장 수 자동 계산 =====

export interface ConcurrentProjectsResult {
  count: number;
  projects: string[];
  basis: string;
}

function monthStart(yearMonth: string): Date {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function monthEnd(yearMonth: string): Date {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)); // 다음 달 0일 = 이번 달 마지막 날
}

// 주의: Project.startDate/endDate(공기)는 현재 더미 값이다. 여기서 계산한 값은
// "기본값 제안"으로만 쓰고, 화면에서 사용자가 직접 조정할 수 있어야 한다.
export async function countConcurrentProjects(
  startMonth: string,
  endMonth: string,
): Promise<ConcurrentProjectsResult> {
  const rangeStart = monthStart(startMonth);
  const rangeEnd = monthEnd(endMonth);

  const candidates = await prisma.project.findMany({
    where: { status: "진행", startDate: { not: null }, endDate: { not: null } },
    select: { projectName: true, startDate: true, endDate: true },
  });

  const overlapping = candidates.filter((p) => p.startDate! <= rangeEnd && p.endDate! >= rangeStart);

  return {
    count: overlapping.length,
    projects: overlapping.map((p) => p.projectName),
    basis:
      `마스터 공기 기준(가정값) — ${startMonth}~${endMonth} 기간에 겹치는 상태=진행 공사 ` +
      `${overlapping.length}건 (Project.startDate/endDate는 더미 값이므로 실제 투입 인력 계획으로 재확인 필요)`,
  };
}
