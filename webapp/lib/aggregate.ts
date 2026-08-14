import { prisma } from "@/lib/prisma";
import { PROBLEM_TYPE } from "@/lib/problemTypes";

// 매출-매입 손익 계산에 절대 넣으면 안 되는 kind. 급여대장/4대보험은 Transaction에
// 저장은 되지만(감사 추적용) 변동비가 아니다 — 인건비는 1-b의 별도 파생원가 계산에 쓴다.
// 여기서 빼지 않으면 getMonthlyPnl 등이 side!=="매출"인 모든 걸 원가로 더해 이중 계상된다.
const NON_PNL_KINDS = ["인건비-급여대장", "인건비-4대보험"];

// 검수 결과를 반영해 P&L 계산에 포함할 거래만 남긴다.
// hold(보류)/excluded(제외)는 손익 계산에서 뺀다. needs_review(미확정)는 유의 사항과 함께 포함한다
// (query-export-skill 예시: "검수 반영분 808건 / 보류 4건 미반영"). 단, "메모 확인 필요"는
// 예외다 — 중복 계상/타사 대납처럼 그 금액 자체가 실제 손익이 아닐 수 있다는 의심이라
// 사람이 확인하기 전까지는 hold와 같이 취급해 뺀다(안전한 기본값은 과다 계상 방지).
export async function getIncludedTransactions() {
  const txs = await prisma.transaction.findMany({
    include: { reviewDecision: true },
    orderBy: { date: "asc" },
  });
  return txs.filter((t) => {
    if (NON_PNL_KINDS.includes(t.kind)) return false;
    const status = t.reviewDecision?.status;
    if (status === "needs_review" && t.reviewDecision?.problemType === PROBLEM_TYPE.MEMO_NEEDS_REVIEW) return false;
    return status !== "hold" && status !== "excluded";
  });
}

function effectiveCategory(t: {
  reviewDecision: { resolvedCategory: string | null; suggestedCategory: string | null } | null;
}): string | null {
  return t.reviewDecision?.resolvedCategory ?? t.reviewDecision?.suggestedCategory ?? null;
}

function isGeneralAdmin(t: { reviewDecision: { problemType: string } | null }): boolean {
  return t.reviewDecision?.problemType === PROBLEM_TYPE.GENERAL_ADMIN;
}

export interface ProjectPnlRow {
  proj: string;
  revenue: number;
  costTaxInvoice: number; // 매입-세금계산서
  costReceipt: number; // 매입-간이영수증
  cost: number;
  profit: number;
  isPassThrough: boolean; // 매출=매입, 손익 0인 통과거래 의심
  counterparty: string; // 매출 거래처 중 가장 자주 등장한 곳(대표 거래처)
}

// month: 그 달만. upToMonth: 그 달까지 누적(둘 다 없으면 전체 기간 누적).
export async function getProjectPnl(options?: {
  month?: string;
  upToMonth?: string;
}): Promise<ProjectPnlRow[]> {
  const txs = await getIncludedTransactions();
  const byProj = new Map<
    string,
    { revenue: number; costTaxInvoice: number; costReceipt: number; placeCounts: Map<string, number> }
  >();

  for (const t of txs) {
    if (isGeneralAdmin(t) || t.proj === "" || t.amount === null) continue;
    if (options?.month && t.month !== options.month) continue;
    if (options?.upToMonth && t.month > options.upToMonth) continue;
    const entry =
      byProj.get(t.proj) ?? { revenue: 0, costTaxInvoice: 0, costReceipt: 0, placeCounts: new Map() };
    if (t.side === "매출") {
      entry.revenue += t.amount;
      if (t.place) entry.placeCounts.set(t.place, (entry.placeCounts.get(t.place) ?? 0) + 1);
    } else if (t.kind === "매입-세금계산서") {
      entry.costTaxInvoice += t.amount;
    } else {
      entry.costReceipt += t.amount;
    }
    byProj.set(t.proj, entry);
  }

  return Array.from(byProj.entries())
    .map(([proj, { revenue, costTaxInvoice, costReceipt, placeCounts }]) => {
      const cost = costTaxInvoice + costReceipt;
      const counterparty =
        [...placeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      return {
        proj,
        revenue,
        costTaxInvoice,
        costReceipt,
        cost,
        profit: revenue - cost,
        isPassThrough: revenue > 0 && revenue === cost,
        counterparty,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

export interface ProjectTransactionRow {
  id: string;
  date: string;
  place: string;
  proj: string;
  amount: number | null;
  side: string;
  memo: string;
}

// /projects 화면에서 프로젝트 행을 펼쳤을 때 보여줄 개별 거래 목록.
// getProjectPnl과 같은 포함 조건(일반관리비 제외, proj/amount 존재, upToMonth)을 그대로 써서
// 집계 숫자와 펼침 목록이 항상 일치하도록 한다.
export async function getProjectTransactions(options?: {
  upToMonth?: string;
}): Promise<Map<string, ProjectTransactionRow[]>> {
  const txs = await getIncludedTransactions();
  const byProj = new Map<string, ProjectTransactionRow[]>();
  for (const t of txs) {
    if (isGeneralAdmin(t) || t.proj === "" || t.amount === null) continue;
    if (options?.upToMonth && t.month > options.upToMonth) continue;
    const list = byProj.get(t.proj) ?? [];
    list.push({ id: t.id, date: t.date, place: t.place, proj: t.proj, amount: t.amount, side: t.side, memo: t.memo });
    byProj.set(t.proj, list);
  }
  return byProj;
}

export interface MonthlyPnlRow {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
}

export async function getMonthlyPnl(): Promise<MonthlyPnlRow[]> {
  const txs = await getIncludedTransactions();
  const byMonth = new Map<string, { revenue: number; cost: number }>();

  for (const t of txs) {
    if (!t.month || t.amount === null) continue;
    const entry = byMonth.get(t.month) ?? { revenue: 0, cost: 0 };
    if (t.side === "매출") entry.revenue += t.amount;
    else entry.cost += t.amount;
    byMonth.set(t.month, entry);
  }

  return Array.from(byMonth.entries())
    .map(([month, { revenue, cost }]) => ({ month, revenue, cost, profit: revenue - cost }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface AdminCategoryRow {
  category: string;
  amount: number;
  count: number;
}

export async function getAdminCategoryBreakdown(options?: {
  upToMonth?: string;
  month?: string;
}): Promise<AdminCategoryRow[]> {
  const txs = await getIncludedTransactions();
  const byCategory = new Map<string, { amount: number; count: number }>();

  for (const t of txs) {
    if (!isGeneralAdmin(t) || t.amount === null) continue;
    if (options?.month && t.month !== options.month) continue;
    if (options?.upToMonth && t.month > options.upToMonth) continue;
    const category = effectiveCategory(t) ?? (t.proj || "미분류");
    const entry = byCategory.get(category) ?? { amount: 0, count: 0 };
    entry.amount += t.amount;
    entry.count += 1;
    byCategory.set(category, entry);
  }

  return Array.from(byCategory.entries())
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount);
}

export interface UnclassifiedResidualTx {
  id: string;
  date: string;
  place: string;
  amount: number;
  side: string;
}

export interface UnclassifiedResidualInfo {
  amount: number; // 손익 기여분(매출이면 +, 매입이면 -)
  count: number;
  transactions: UnclassifiedResidualTx[];
}

// 프로젝트별 손익 화면의 "사각지대" — proj가 비어 있고 일반관리비도 아니면서 아직 검수
// 대기 중인 거래. 전사 손익(변동비 기준)에는 포함되지만 /projects에도 /admin-costs에도
// 안 보인다. "메모 확인 필요"는 getIncludedTransactions()가 이미 통째로 빼므로 여기서도
// 같은 기준으로 제외해야 항등식(검사 A)이 원 단위로 맞는다.
export async function getUnclassifiedResidual(options?: {
  upToMonth?: string;
}): Promise<UnclassifiedResidualInfo> {
  const decisions = await prisma.reviewDecision.findMany({
    where: {
      status: "needs_review",
      problemType: { not: PROBLEM_TYPE.MEMO_NEEDS_REVIEW },
      transaction: { proj: "", amount: { not: null } },
    },
    include: { transaction: true },
  });

  const transactions: UnclassifiedResidualTx[] = [];
  let amount = 0;
  for (const d of decisions) {
    const t = d.transaction;
    if (options?.upToMonth && t.month > options.upToMonth) continue;
    amount += t.side === "매출" ? t.amount! : -t.amount!;
    transactions.push({ id: t.id, date: t.date, place: t.place, amount: t.amount!, side: t.side });
  }

  return { amount, count: transactions.length, transactions };
}

// 건설업 원가율은 통상 80~90%라, 매출(청구액)이 매입(투입원가)의 절반도 안 되면
// 공사비를 썼는데 기성 청구를 안 했을 가능성이 높다. 계약금액 없이도 판정 가능하다.
export const UNBILLED_THRESHOLD = 0.5;
export const MIN_PURCHASE_FOR_CHECK = 1_000_000;

export interface UnbilledAlert {
  proj: string;
  revenue: number;
  cost: number;
  ratio: number; // revenue / cost
  profit: number;
}

// Project.category === "공사"로 등록된 프로젝트만 판정한다(공통비/인별경비 계정,
// 마스터에 없는 값은 자동 제외되는 안전한 기본값). 통과거래(매출=매입)와 소액 매입은
// 오탐이라 제외한다. 손익에는 반영하지 않고 감지·표시만 한다.
export async function getUnbilledCompletionAlerts(options?: {
  upToMonth?: string;
}): Promise<UnbilledAlert[]> {
  const [projectRows, constructionProjects] = await Promise.all([
    getProjectPnl(options),
    prisma.project.findMany({ where: { category: "공사" }, select: { projectName: true } }),
  ]);
  const constructionSet = new Set(constructionProjects.map((p) => p.projectName));

  const alerts: UnbilledAlert[] = [];
  for (const p of projectRows) {
    if (!constructionSet.has(p.proj)) continue;
    if (p.isPassThrough) continue;
    if (p.cost < MIN_PURCHASE_FOR_CHECK) continue;
    const ratio = p.revenue / p.cost;
    if (ratio < UNBILLED_THRESHOLD) {
      alerts.push({ proj: p.proj, revenue: p.revenue, cost: p.cost, ratio, profit: p.profit });
    }
  }

  return alerts.sort((a, b) => a.ratio - b.ratio);
}

// /admin-costs 화면에서 분류별 행을 펼쳤을 때 보여줄 개별 거래 목록.
// getAdminCategoryBreakdown과 같은 포함 조건으로 묶어 집계 숫자와 항상 일치시킨다.
export async function getAdminCategoryTransactions(): Promise<Map<string, ProjectTransactionRow[]>> {
  const txs = await getIncludedTransactions();
  const byCategory = new Map<string, ProjectTransactionRow[]>();
  for (const t of txs) {
    if (!isGeneralAdmin(t) || t.amount === null) continue;
    const category = effectiveCategory(t) ?? (t.proj || "미분류");
    const list = byCategory.get(category) ?? [];
    list.push({ id: t.id, date: t.date, place: t.place, proj: t.proj, amount: t.amount, side: t.side, memo: t.memo });
    byCategory.set(category, list);
  }
  return byCategory;
}

export interface ReviewSummary {
  total: number;
  autoConfirmed: number;
  needsReview: number;
  confirmed: number;
  excluded: number;
  modified: number;
  hold: number;
}

export async function getReviewSummary(): Promise<ReviewSummary> {
  const grouped = await prisma.reviewDecision.groupBy({
    by: ["status"],
    _count: true,
  });
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  return {
    total: grouped.reduce((sum, g) => sum + g._count, 0),
    autoConfirmed: counts["auto_confirmed"] ?? 0,
    needsReview: counts["needs_review"] ?? 0,
    confirmed: counts["confirmed"] ?? 0,
    excluded: counts["excluded"] ?? 0,
    modified: counts["modified"] ?? 0,
    hold: counts["hold"] ?? 0,
  };
}

// 대시보드 "총 매입" 카드의 "세금계산서 48.1억 · 간이 3.1억" 같은 부제용.
export async function getPurchaseKindBreakdown(): Promise<Record<string, number>> {
  const txs = await getIncludedTransactions();
  const sums: Record<string, number> = {};
  for (const t of txs) {
    if (t.side !== "매입" || t.amount === null) continue;
    sums[t.kind] = (sums[t.kind] ?? 0) + t.amount;
  }
  return sums;
}

export async function getFileSummary() {
  const files = await prisma.processedFile.findMany({
    orderBy: { uploadedAt: "desc" },
    take: 20,
  });
  const totalTx = await prisma.transaction.count();
  return { files, totalTx };
}

export interface NewProjectInfo {
  proj: string;
  firstMonth: string;
}

// "가장 최근에 처리된 파일에만" 등장하는 proj 값 = 이번 업로드로 새로 등록된 프로젝트.
// classify.ts는 이미 이런 값을 검수로 보내지 않고 자동으로 "정상" 처리한다(현장이
// 있으면 그 자체로 값 비교 규칙 3원칙을 만족) — 여기서는 화면에 NEW 표시를 하기 위해
// "새로 등장한 값인가"만 별도로 계산한다.
export async function getNewProjects(): Promise<{ latestFileName: string | null; projects: NewProjectInfo[] }> {
  const latestFile = await prisma.processedFile.findFirst({
    where: { status: "processed" },
    orderBy: { uploadedAt: "desc" },
  });
  if (!latestFile) return { latestFileName: null, projects: [] };

  const [txs, projRules] = await Promise.all([
    prisma.transaction.findMany({
      where: { proj: { not: "" } },
      select: { proj: true, sourceFile: true, month: true },
    }),
    prisma.adminCategoryRule.findMany({ where: { matchOn: "proj" }, select: { pattern: true } }),
  ]);
  const adminProjSet = new Set(projRules.map((r) => r.pattern));

  const byProj = new Map<string, { files: Set<string>; months: string[] }>();
  for (const t of txs) {
    if (adminProjSet.has(t.proj)) continue; // 관리비 계정으로 등록된 값은 프로젝트가 아니다
    const entry = byProj.get(t.proj) ?? { files: new Set<string>(), months: [] };
    entry.files.add(t.sourceFile);
    entry.months.push(t.month);
    byProj.set(t.proj, entry);
  }

  const projects: NewProjectInfo[] = [];
  for (const [proj, entry] of byProj) {
    const onlyInLatestFile = entry.files.size === 1 && entry.files.has(latestFile.fileName);
    if (onlyInLatestFile) {
      projects.push({ proj, firstMonth: [...entry.months].sort()[0] });
    }
  }

  return { latestFileName: latestFile.fileName, projects };
}

export interface DerivedCostSummary {
  labor: number;
  interest: number;
  depreciation: number;
  total: number;
  unallocated: number; // projectName === null (전사 미배부)
  byProject: { projectName: string; amount: number }[];
  uncalculable: { loanCode: string; reason: string }[]; // L03 등 연이율 미기재
}

// 작업 1-b: lib/derivedCost.ts가 계산해 DerivedCost에 저장한 값을 조회만 한다.
// 기존 손익(getProjectPnl/getMonthlyPnl 등) 계산 로직은 건드리지 않는다 — 파생원가는
// 여기서 별도로 조회하고, 프로젝트 배부는 1-c에서 정한다(여기서는 배부하지 않는다).
export async function getDerivedCostSummary(yearMonth?: string): Promise<DerivedCostSummary> {
  const rows = await prisma.derivedCost.findMany(yearMonth ? { where: { yearMonth } } : undefined);

  let labor = 0;
  let interest = 0;
  let depreciation = 0;
  let unallocated = 0;
  const byProjectMap = new Map<string, number>();

  for (const r of rows) {
    const amount = Number(r.amount);
    if (r.costType === "인건비") labor += amount;
    else if (r.costType === "이자") interest += amount;
    else if (r.costType === "감가상각") depreciation += amount;

    if (r.projectName === null) {
      unallocated += amount;
    } else {
      byProjectMap.set(r.projectName, (byProjectMap.get(r.projectName) ?? 0) + amount);
    }
  }

  const uncalculableLoans = await prisma.loan.findMany({ where: { annualRate: null } });

  return {
    labor,
    interest,
    depreciation,
    total: labor + interest + depreciation,
    unallocated,
    byProject: [...byProjectMap.entries()].map(([projectName, amount]) => ({ projectName, amount })),
    uncalculable: uncalculableLoans.map((l) => ({
      loanCode: l.loanCode,
      reason: "연이율 미기재로 이자 계산에서 제외됨",
    })),
  };
}

export interface DerivedCostMonthRow {
  month: string;
  laborSalary: number;
  laborDaily: number;
  laborSocial: number;
  laborRetirement: number;
  labor: number; // 위 4개 합
  interest: number;
  depreciation: number;
  total: number;
}

// lib/derivedCost.ts가 basis 텍스트에 남긴 구분(급여/일용직/4대보험/퇴직충당)을 그대로
// 문자열로 매칭한다 — DerivedCost에는 인건비 세부 항목을 나눌 별도 컬럼이 없고, 이 텍스트는
// 같은 코드가 직접 써넣은 값이라 매칭이 안전하다.
function classifyLaborBasis(basis: string): "laborDaily" | "laborSocial" | "laborRetirement" | "laborSalary" {
  // basis 문구들이 서로의 카테고리명을 괄호 안 설명("일용직 제외", "4대보험·퇴직충당
  // 미적용")에 인용하고 있어 includes()로 아무 위치나 매칭하면 서로 오검출된다.
  // 각 문구의 시작 부분만 확인해 완전히 구분한다.
  if (basis.startsWith("일용직 지급액")) return "laborDaily";
  if (basis.startsWith("4대보험")) return "laborSocial";
  if (basis.startsWith("퇴직충당")) return "laborRetirement";
  return "laborSalary";
}

// 대시보드/월별 추이 차트에서 "변동비 기준 vs 손익" 두 계열을 그리기 위한 월별 파생원가.
export async function getDerivedCostByMonth(): Promise<DerivedCostMonthRow[]> {
  const rows = await prisma.derivedCost.findMany();
  const byMonth = new Map<
    string,
    { laborSalary: number; laborDaily: number; laborSocial: number; laborRetirement: number; interest: number; depreciation: number }
  >();

  for (const r of rows) {
    const entry =
      byMonth.get(r.yearMonth) ??
      { laborSalary: 0, laborDaily: 0, laborSocial: 0, laborRetirement: 0, interest: 0, depreciation: 0 };
    const amount = Number(r.amount);
    if (r.costType === "인건비") entry[classifyLaborBasis(r.basis)] += amount;
    else if (r.costType === "이자") entry.interest += amount;
    else if (r.costType === "감가상각") entry.depreciation += amount;
    byMonth.set(r.yearMonth, entry);
  }

  return Array.from(byMonth.entries())
    .map(([month, e]) => {
      const labor = e.laborSalary + e.laborDaily + e.laborSocial + e.laborRetirement;
      return { month, ...e, labor, total: labor + e.interest + e.depreciation };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}
