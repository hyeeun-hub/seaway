import { prisma } from "@/lib/prisma";
import type { Loan, Asset } from "@/generated/prisma/client";

// L3 파생원가(이자·감가상각·인건비) 계산. 작업 1-a에서 그릇만 만들었고, 여기서 실제
// 계산과 DerivedCost 저장까지 한다. 화면 표시는 1-c.

// 2026-04 4대보험 고지서 역산: 건강보험 606,100 + 국민연금 650,680 + 고용보험 3,760 +
// 산재보험 4,830 = 1,265,370원(노사 합산). 회사 부담분 = 건강/2 + 국민/2 + 고용 + 산재
// = 303,050 + 325,340 + 3,760 + 4,830 = 636,980원. 636,980 ÷ 급여 9,713,600 = 6.56%.
// 실데이터가 2026-04 한 달분(4행)만 있어 이 비율을 역산해 전 기간에 적용한다.
// 화면에는 "추정"이 아니라 "2026-04 고지서 역산"으로 표기한다.
export const SOCIAL_INSURANCE_RATE = 0.0656;

// 근로자퇴직급여보장법상 1년 근속 시 30일분 평균임금(= 급여의 1/12). 추정치가 아니라
// 법정 계산이다.
export const RETIREMENT_RATE = 0.0833;

// 대출·자산이 2023~2025년에 시작된 것이 많아, 기간 제한 없이 계산하면 실행일부터
// 전체 개월치가 잡힌다(L01은 29개월치). 이번 파생원가는 실거래 데이터가 있는
// 2026-01~05만 계산한다.
export const PERIOD_START = "2026-01";
export const PERIOD_END = "2026-05";

function ym(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function addMonths(yearMonth: string, months: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function monthRange(start: string, end: string): string[] {
  const result: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    result.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return result;
}

// 대출/자산의 활동 기간을 계산 기간(PERIOD_START~PERIOD_END)으로 잘라낸다.
function clipToPeriod(itemStartMonth: string, itemEndMonth: string): string[] {
  const start = itemStartMonth > PERIOD_START ? itemStartMonth : PERIOD_START;
  const end = itemEndMonth < PERIOD_END ? itemEndMonth : PERIOD_END;
  if (start > end) return [];
  return monthRange(start, end);
}

export interface DerivedCostRowInput {
  yearMonth: string;
  costType: "이자" | "감가상각" | "인건비";
  projectName: string | null;
  amount: bigint;
  basis: string;
  sourceCode: string | null;
}

export interface UncalculableLoan {
  loanCode: string;
  reason: string;
}

// 월 이자 = 원금 × 연이율(%) ÷ 100 ÷ 12. annualRate가 null이면(더미 L03) 0으로 채우지
// 않고 계산에서 완전히 제외한다(state-schema.md §5).
function computeInterestRows(loans: Loan[]): { rows: DerivedCostRowInput[]; uncalculable: UncalculableLoan[] } {
  const rows: DerivedCostRowInput[] = [];
  const uncalculable: UncalculableLoan[] = [];

  for (const loan of loans) {
    if (loan.annualRate === null) {
      uncalculable.push({ loanCode: loan.loanCode, reason: "연이율(annualRate) 미기재로 이자 계산에서 제외됨(0으로 채우지 않음)" });
      continue;
    }
    const principal = Number(loan.principal);
    const monthlyInterest = Math.floor((principal * loan.annualRate) / 100 / 12);
    const months = clipToPeriod(ym(loan.startDate), ym(loan.endDate));
    const projectName = loan.scope === "프로젝트" ? loan.projectName : null;
    const basis = `원금 ${principal.toLocaleString()} × ${loan.annualRate}% ÷ 12 = ${monthlyInterest.toLocaleString()}원/월`;

    for (const yearMonth of months) {
      rows.push({
        yearMonth,
        costType: "이자",
        projectName,
        amount: BigInt(monthlyInterest),
        basis,
        sourceCode: loan.loanCode,
      });
    }
  }

  return { rows, uncalculable };
}

export interface DepreciationMismatch {
  assetCode: string;
  storedMonthlyDep: number;
  computedMonthlyDep: number;
}

// 월 상각액 = (취득가액 − 잔존가액) ÷ (내용연수 × 12). Asset.monthlyDep에 값이
// 저장돼 있지만 코드에서 다시 계산해 검증한다.
function computeDepreciationRows(assets: Asset[]): { rows: DerivedCostRowInput[]; mismatches: DepreciationMismatch[] } {
  const rows: DerivedCostRowInput[] = [];
  const mismatches: DepreciationMismatch[] = [];

  for (const asset of assets) {
    const acquireCost = Number(asset.acquireCost);
    const computedMonthlyDep = Math.floor((acquireCost - asset.residualValue) / (asset.usefulYears * 12));
    if (computedMonthlyDep !== asset.monthlyDep) {
      mismatches.push({
        assetCode: asset.assetCode,
        storedMonthlyDep: asset.monthlyDep,
        computedMonthlyDep,
      });
    }

    const startMonth = ym(asset.acquireDate);
    const endMonth = addMonths(startMonth, asset.usefulYears * 12);
    const months = clipToPeriod(startMonth, endMonth);
    const projectName = asset.scope === "프로젝트" ? asset.projectName : null;
    const basis = `(취득가 ${acquireCost.toLocaleString()} − 잔존 ${asset.residualValue.toLocaleString()}) ÷ (${asset.usefulYears}년×12) = ${computedMonthlyDep.toLocaleString()}원/월`;

    for (const yearMonth of months) {
      rows.push({
        yearMonth,
        costType: "감가상각",
        projectName,
        amount: BigInt(computedMonthlyDep),
        basis,
        sourceCode: asset.assetCode,
      });
    }
  }

  return { rows, mismatches };
}

// 인건비 = 급여 + 일용직(그대로) + 4대보험 회사부담(급여×6.56%) + 퇴직충당(급여×8.33%).
// 일용직에는 4대보험·퇴직충당을 적용하지 않는다. 배부 근거(근태)가 없어 전부 전사
// 미배부(projectName=null)로 둔다.
//
// 4대보험/퇴직충당은 "누적 급여에 비율을 곱해 floor한 값의 월간 차분"으로 계산한다
// (단순히 매월 floor(그달 급여×비율)을 더하면 월별 절사가 누적돼 5개월 합계가 1~4원
// 모자라진다 — 세무/급여 시스템에서 흔히 쓰는 누적차분 방식으로 정확히 맞춘다).
async function computeLaborRows(): Promise<DerivedCostRowInput[]> {
  const payroll = await prisma.transaction.findMany({
    where: { kind: "인건비-급여대장", month: { gte: PERIOD_START, lte: PERIOD_END } },
    orderBy: { month: "asc" },
  });

  const rows: DerivedCostRowInput[] = [];
  let cumSalary = 0;
  let cumSocial = 0;
  let cumRetirement = 0;

  for (const yearMonth of monthRange(PERIOD_START, PERIOD_END)) {
    const salaryTx = payroll.find((t) => t.month === yearMonth && t.use === "급여");
    const dailyTx = payroll.find((t) => t.month === yearMonth && t.use === "일용직");

    if (salaryTx && salaryTx.amount !== null) {
      rows.push({
        yearMonth,
        costType: "인건비",
        projectName: null,
        amount: BigInt(salaryTx.amount),
        basis: "급여대장 지급액(귀속년월 기준)",
        sourceCode: null,
      });

      cumSalary += salaryTx.amount;
      const targetSocial = Math.floor(cumSalary * SOCIAL_INSURANCE_RATE);
      const monthSocial = targetSocial - cumSocial;
      cumSocial = targetSocial;
      rows.push({
        yearMonth,
        costType: "인건비",
        projectName: null,
        amount: BigInt(monthSocial),
        basis: `4대보험 회사부담(2026-04 고지서 역산 ${(SOCIAL_INSURANCE_RATE * 100).toFixed(2)}%, 일용직 제외)`,
        sourceCode: null,
      });

      const targetRetirement = Math.floor(cumSalary * RETIREMENT_RATE);
      const monthRetirement = targetRetirement - cumRetirement;
      cumRetirement = targetRetirement;
      rows.push({
        yearMonth,
        costType: "인건비",
        projectName: null,
        amount: BigInt(monthRetirement),
        basis: `퇴직충당(근로자퇴직급여보장법, 급여×${(RETIREMENT_RATE * 100).toFixed(2)}%, 일용직 제외)`,
        sourceCode: null,
      });
    }

    if (dailyTx && dailyTx.amount !== null) {
      rows.push({
        yearMonth,
        costType: "인건비",
        projectName: null,
        amount: BigInt(dailyTx.amount),
        basis: "일용직 지급액(4대보험·퇴직충당 미적용)",
        sourceCode: null,
      });
    }
  }

  return rows;
}

function makeRunId(now: Date): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${y}${mo}${d}-${hh}${mi}-${PERIOD_START}_${PERIOD_END}`;
}

export interface RecomputeResult {
  runId: string;
  rowCount: number;
  interestTotal: number;
  depreciationTotal: number;
  laborTotal: number;
  grandTotal: number;
  uncalculableLoans: UncalculableLoan[];
  depreciationMismatches: DepreciationMismatch[];
}

// 파생원가는 append-only가 아니다 — 실행할 때마다 기존 DerivedCost를 전량 삭제하고
// runId 단위로 재생성한다. 같은 입력(Loan/Asset/Transaction)이면 항상 같은 금액이
// 나온다(난수·현재시각에 계산이 의존하지 않음 — runId의 타임스탬프는 배치 식별용일 뿐).
export async function recomputeDerivedCosts(): Promise<RecomputeResult> {
  const [loans, assets] = await Promise.all([prisma.loan.findMany(), prisma.asset.findMany()]);

  const { rows: interestRows, uncalculable } = computeInterestRows(loans);
  const { rows: depreciationRows, mismatches } = computeDepreciationRows(assets);
  const laborRows = await computeLaborRows();

  const allRows = [...interestRows, ...depreciationRows, ...laborRows];
  const runId = makeRunId(new Date());

  await prisma.$transaction([
    prisma.derivedCost.deleteMany({}),
    prisma.derivedCost.createMany({
      data: allRows.map((r) => ({
        runId,
        yearMonth: r.yearMonth,
        costType: r.costType,
        projectName: r.projectName,
        amount: r.amount,
        basis: r.basis,
        sourceCode: r.sourceCode,
      })),
    }),
  ]);

  const sum = (rows: DerivedCostRowInput[]) => rows.reduce((s, r) => s + Number(r.amount), 0);
  const interestTotal = sum(interestRows);
  const depreciationTotal = sum(depreciationRows);
  const laborTotal = sum(laborRows);

  return {
    runId,
    rowCount: allRows.length,
    interestTotal,
    depreciationTotal,
    laborTotal,
    grandTotal: interestTotal + depreciationTotal + laborTotal,
    uncalculableLoans: uncalculable,
    depreciationMismatches: mismatches,
  };
}
