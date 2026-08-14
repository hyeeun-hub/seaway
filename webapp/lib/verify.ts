import { prisma } from "@/lib/prisma";
import {
  getMonthlyPnl,
  getProjectPnl,
  getAdminCategoryBreakdown,
  getDerivedCostSummary,
  getUnclassifiedResidual,
  getIncludedTransactions,
} from "@/lib/aggregate";
import { getCalendarSummary } from "@/lib/calendar";
import { PROBLEM_TYPE } from "@/lib/problemTypes";

const LABOR_KINDS = ["인건비-급여대장", "인건비-4대보험"];
const ZERO = BigInt(0);

function won(n: bigint): string {
  return `${n.toLocaleString()}원`;
}

export interface VerifyCheck {
  point: string;
  item: string;
  result: "통과" | "경고" | "이상";
  detail: string;
  cause?: string;
  action?: string;
  retryNeeded?: boolean;
}

// verify-skill의 체크 항목. 통과 항목도 숨기지 않고 전부 포함한다(제약: "검사 결과 은닉 금지").
export async function runVerifyChecks(): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];

  // after_file_input: 추가 + 스킵 = 데이터행 수
  const files = await prisma.processedFile.findMany({ where: { status: "processed" } });
  for (const f of files) {
    const anomalyCount = Array.isArray(f.anomalies) ? f.anomalies.length : 0;
    const isMaster = f.kind?.startsWith("마스터-") ?? false;
    const strictOk = f.txAdded + f.txSkippedDuplicate === (f.rowCount ?? 0);
    // 마스터 파일은 ERP 4종과 달리 "행 안이지만 데이터가 아닌 행"(안내문·범례 행)이
    // 있을 수 있다 — 필수 키가 비어 있으면 업서트하지 않고 anomalies에 사유를 남긴 채
    // 건너뛴다. 이 건너뜀은 데이터 손실이 아니라 정상 동작이라, 추가+스킵만으로는
    // 안 맞는 게 당연하다. anomalies 건수까지 더해서 맞으면 무해로 처리한다.
    const masterOk = isMaster && f.txAdded + f.txSkippedDuplicate + anomalyCount === (f.rowCount ?? 0);
    const ok = strictOk || masterOk;
    checks.push({
      point: "after_file_input",
      item: `추가+스킵=데이터행수 (${f.fileName})`,
      result: ok ? "통과" : "이상",
      detail: masterOk
        ? `추가 ${f.txAdded} + 안내문 등 건너뜀 ${anomalyCount} = 데이터행 ${f.rowCount} (마스터 파일의 안내문/범례 행 — 무해)`
        : `추가 ${f.txAdded} + 스킵 ${f.txSkippedDuplicate} = ${f.txAdded + f.txSkippedDuplicate} / 데이터행 ${f.rowCount}`,
      cause: ok ? undefined : "seq 배정 또는 파싱 로직 불일치 의심",
      action: ok ? undefined : "해당 파일을 다시 확인 후 재처리 필요",
      retryNeeded: !ok,
    });
  }

  const rejected = await prisma.processedFile.findMany({ where: { status: "rejected" } });
  for (const f of rejected) {
    checks.push({
      point: "after_file_input",
      item: `접수 거부 (${f.fileName})`,
      result: "이상",
      detail: Array.isArray(f.anomalies) ? (f.anomalies as string[]).join("; ") : String(f.anomalies),
      cause: "state-schema.md §3 매핑표에 등록되지 않은 파일명/열 구성",
      action: "매핑표에 행을 추가하거나 원본 형식을 확인한 뒤 재업로드",
      retryNeeded: true,
    });
  }

  // after_analyze: 금액 누락
  const totalTx = await prisma.transaction.count();
  const nullAmount = await prisma.transaction.count({ where: { amount: null } });
  checks.push({
    point: "after_analyze",
    item: "금액 누락",
    result: nullAmount > 0 ? "이상" : "통과",
    detail: `${nullAmount}건 / 전체 ${totalTx}건`,
    cause: nullAmount > 0 ? "원본 파일의 금액 셀이 비어 있음(파싱 오류 아님)" : undefined,
    action: nullAmount > 0 ? "0으로 채우지 않고 검수 목록에서 원본 확인" : undefined,
    retryNeeded: false,
  });

  // after_analyze: 프로젝트 미매칭 비율
  const unmatched = await prisma.reviewDecision.count({
    where: { problemType: { in: [PROBLEM_TYPE.UNMATCHED_BLANK, PROBLEM_TYPE.UNMATCHED_FLAGGED] } },
  });
  const unmatchedRatio = totalTx > 0 ? unmatched / totalTx : 0;
  checks.push({
    point: "after_analyze",
    item: "프로젝트 미매칭 비율",
    result: unmatchedRatio > 0.05 ? "경고" : "통과",
    detail: `${unmatched}건 (${(unmatchedRatio * 100).toFixed(1)}%)`,
    cause: unmatchedRatio > 0.05 ? "원본 미기재 또는 프로젝트가 아닌 값 입력" : undefined,
    action: unmatchedRatio > 0.05 ? "검수 목록에서 확인/확정 필요" : undefined,
    retryNeeded: false,
  });

  // after_analyze: 분류 보류(간이영수증 사용처 미매칭) 비율.
  // 이 검사는 원래 "분류 애매(사용처 미매칭)"라는 problemType을 세어 판정했으나, classify.ts는
  // 이 문자열을 만들지 않는다(과거 버전의 흔적으로 보임) — 항상 0건이라 실패할 수 없는 죽은
  // 검사였다. classify.ts를 다시 읽어 원래 의도를 역추적하면, "사용처 규칙 미매칭"은 하나의
  // problemType으로 저장되지 않는다: 간이영수증(용도·내용 공백)의 place가 place_keyword
  // 규칙에 안 걸리면 proj/금액에 따라 "정상"(미분류)·"일반관리비"(미분류 일반관리비)·
  // "미매칭(공백)"으로 각각 갈린다. 그래서 저장된 problemType이 아니라 classify.ts와 같은
  // place_keyword 매칭 로직을 그대로 재실행해 "미매칭" 여부를 직접 판정한다.
  const [receiptCandidates, placeKeywordRules] = await Promise.all([
    prisma.transaction.findMany({
      where: { kind: "매입-간이영수증", use: "", content: "", amount: { not: null } },
      select: { place: true },
    }),
    prisma.adminCategoryRule.findMany({ where: { matchOn: "place_keyword" }, select: { pattern: true } }),
  ]);
  const unclassified = receiptCandidates.filter(
    (t) => !placeKeywordRules.some((r) => t.place.includes(r.pattern)),
  ).length;
  const unclassifiedRatio = totalTx > 0 ? unclassified / totalTx : 0;
  checks.push({
    point: "after_analyze",
    item: "분류 보류 비율(간이영수증 사용처 미매칭)",
    result: unclassifiedRatio > 0.3 ? "경고" : "통과",
    detail: `${unclassified}건 / 간이영수증(용도·내용 공백) ${receiptCandidates.length}건 중 미매칭, 전체 ${totalTx}건 대비 ${(unclassifiedRatio * 100).toFixed(1)}%`,
    cause: unclassifiedRatio > 0.3 ? "원본 데이터 자체에 용도가 입력되지 않음. 파싱 오류 아님" : undefined,
    action: unclassifiedRatio > 0.3 ? "AdminCategoryRule에 사용처 키워드 규칙 추가 검토" : undefined,
    retryNeeded: false,
  });

  // after_classify: 배정 누락 여부(모든 거래에 ReviewDecision이 있어야 함)
  const decided = await prisma.reviewDecision.count();
  checks.push({
    point: "after_classify",
    item: "배정 누락/중복",
    result: decided === totalTx ? "통과" : "이상",
    detail: `거래 ${totalTx}건 중 분류 결과 ${decided}건`,
    cause: decided !== totalTx ? "classify 단계가 일부 거래를 건너뜀" : undefined,
    action: decided !== totalTx ? "누락된 거래를 찾아 재분류 필요" : undefined,
    retryNeeded: decided !== totalTx,
  });

  // after_classify: 일반관리비로 분류된 건 중 "진짜 현장"이 지정된 건이 있는지.
  // isGeneralAdmin()이 problemType==="일반관리비"로만 판정하므로, 이 값이 잘못 붙으면
  // 현장이 있는 원가가 조용히 일반관리비로 새어나가 프로젝트별 손익이 과소 계상된다.
  // 주의: AdminCategoryRule(matchOn:"proj")에 등록된 값(사무실운영/송인석 등)은 proj가
  // 비어있지 않아도 의도적으로 일반관리비로 분류되는 게 맞다 — 이 값들을 빼지 않으면
  // 매번 "이상"으로 오탐(현재 151건)이 나서 진짜 이상을 못 찾는다.
  const adminProjRulesForD = await prisma.adminCategoryRule.findMany({
    where: { matchOn: "proj" },
    select: { pattern: true },
  });
  const adminProjPatternSet = new Set(adminProjRulesForD.map((r) => r.pattern));
  const adminWithProjRaw = await prisma.transaction.findMany({
    where: { reviewDecision: { problemType: PROBLEM_TYPE.GENERAL_ADMIN }, proj: { not: "" } },
    select: { id: true, proj: true, place: true, amount: true },
  });
  const adminWithProj = adminWithProjRaw.filter((t) => !adminProjPatternSet.has(t.proj));
  checks.push({
    point: "after_classify",
    item: "일반관리비 분류 건 중 프로젝트 지정 건 존재 여부",
    result: adminWithProj.length === 0 ? "통과" : "이상",
    detail:
      adminWithProj.length === 0
        ? `0건 (등록된 관리비 계정 proj ${adminWithProjRaw.length}건은 정상 제외)`
        : `${adminWithProj.length}건 — 예: ${adminWithProj
            .slice(0, 3)
            .map((t) => `${t.proj}/${t.place}/${t.amount}원`)
            .join(", ")}`,
    cause: adminWithProj.length > 0 ? "현장이 지정된 거래가 일반관리비로 분류됨. classify 분기 조건 확인 필요" : undefined,
    action: adminWithProj.length > 0 ? "classify.ts의 problemType 배정 로직을 확인하고 전체 재분류 실행" : undefined,
    retryNeeded: adminWithProj.length > 0,
  });

  // after_query_export: 월별 집계 합계 정합. getMonthlyPnl()은 t.month가 비어 있으면(날짜
  // 파싱 실패 등) 그 거래를 통째로 건너뛴다(`if (!t.month || ...) continue`) — 즉 손익
  // 포함 대상인데 월별 집계에서는 조용히 빠질 수 있다. 이전 코드는 "통과"를 그냥 대입해
  // 이 케이스를 절대 못 잡았다. 월(month) 구분 없이 같은 포함 조건(getIncludedTransactions)
  // 으로 통째로 다시 합산해 월별 합계와 비교한다 — 다르면 month 누락 거래가 있다는 뜻이다.
  const monthly = await getMonthlyPnl();
  const monthlySum = monthly.reduce(
    (s, m) => ({ revenue: s.revenue + m.revenue, cost: s.cost + m.cost }),
    { revenue: 0, cost: 0 },
  );
  const allIncludedTx = await getIncludedTransactions();
  const flatSum = allIncludedTx.reduce(
    (s, t) => {
      if (t.amount === null) return s;
      return t.side === "매출" ? { ...s, revenue: s.revenue + t.amount } : { ...s, cost: s.cost + t.amount };
    },
    { revenue: 0, cost: 0 },
  );
  const monthlyMismatch = flatSum.revenue !== monthlySum.revenue || flatSum.cost !== monthlySum.cost;
  checks.push({
    point: "after_query_export",
    item: "월별 집계 합계 정합",
    result: monthlyMismatch ? "이상" : "통과",
    detail:
      `월별 합 재계산: 매출 ${monthlySum.revenue.toLocaleString()}원 / 매입 ${monthlySum.cost.toLocaleString()}원 (${monthly.length}개월)` +
      ` / 월 구분 없는 전체 합계: 매출 ${flatSum.revenue.toLocaleString()}원 / 매입 ${flatSum.cost.toLocaleString()}원` +
      (monthlyMismatch
        ? ` / 차액: 매출 ${(flatSum.revenue - monthlySum.revenue).toLocaleString()}원, 매입 ${(flatSum.cost - monthlySum.cost).toLocaleString()}원`
        : ""),
    cause: monthlyMismatch ? "일부 거래의 month 값이 비어 있어 월별 집계에서 빠짐(날짜 파싱 실패 의심)" : undefined,
    action: monthlyMismatch ? "date/month가 비정상인 거래를 찾아 원본 확인" : undefined,
    retryNeeded: monthlyMismatch,
  });

  // 검사 A: 프로젝트 합계 = 전사 합계. 일반관리비는 순수 비용(매출 없음)이라 손익
  // 기여분은 -adminSum이다. proj가 공백이면서 일반관리비도 아닌 검수 대기 잔차(미분류)는
  // /projects·/admin-costs 어느 화면에도 안 보이지만 전사 손익에는 포함되므로, 그 잔차를
  // getUnclassifiedResidual()로 명시적으로 더해야 항등식이 원 단위로 정확히 맞는다
  // (이 잔차를 빼놓으면 87,200원 사각지대가 생겨 검사가 상시 "이상"으로 뜬다 — /projects
  // 하단의 "미분류 (검수 대기)" 라인이 바로 이 값이다). 원 단위 오차를 허용하지 않도록
  // BigInt로 계산한다.
  const [projectRowsA, adminRowsA, unclassifiedA] = await Promise.all([
    getProjectPnl(),
    getAdminCategoryBreakdown(),
    getUnclassifiedResidual(),
  ]);
  const grandTotalA = monthly.reduce((s, m) => s + BigInt(m.profit), ZERO);
  const projectSumA = projectRowsA.reduce((s, p) => s + BigInt(p.profit), ZERO);
  const adminSumA = adminRowsA.reduce((s, r) => s + BigInt(r.amount), ZERO);
  const unclassifiedSumA = BigInt(unclassifiedA.amount);
  const identityLeftA = projectSumA - adminSumA + unclassifiedSumA;
  const diffA = grandTotalA - identityLeftA;
  checks.push({
    point: "after_query_export",
    item: "정합성 검산 A — 프로젝트 합계 + 일반관리비 손익 + 미분류 잔차 = 전사 손익",
    result: diffA === ZERO ? "통과" : "이상",
    detail:
      `프로젝트 합계 ${won(projectSumA)} − 일반관리비 ${won(adminSumA)} + 미분류(검수 대기) ${won(unclassifiedSumA)}` +
      ` (${unclassifiedA.count}건) = ${won(identityLeftA)} / 전사 손익(변동비 기준) ${won(grandTotalA)} / 차액 ${won(diffA)}`,
    cause: diffA !== ZERO ? "프로젝트 집계와 전사 집계가 어긋남. 분류 누락 또는 이중 계상 확인" : undefined,
    action:
      diffA !== ZERO
        ? "proj가 공백이면서 일반관리비도 아닌 검수 대기 건(미매칭·공백)이 있는지 /review에서 확인"
        : undefined,
    retryNeeded: diffA !== ZERO,
  });

  // 검사 B: 파생원가 반영 검증. DerivedCost 원본 합계(raw)와 getDerivedCostSummary()의
  // 분류 합계(labor+interest+depreciation)가 같은지 먼저 확인한다(costType 문자열이
  // 하나라도 안 걸리면 raw 합계보다 작게 나와 조용히 누락된다). 그 다음 전사 손익에서
  // 파생원가를 뺀 "손익"을 계산해 보고한다.
  const derivedRowsRaw = await prisma.derivedCost.findMany({ select: { amount: true } });
  const derivedTotalRaw = derivedRowsRaw.reduce((s, r) => s + r.amount, ZERO);
  const derivedSummaryB = await getDerivedCostSummary();
  const derivedTotalFromSummary = BigInt(derivedSummaryB.total);
  const diffB = derivedTotalRaw - derivedTotalFromSummary;
  const realProfitB = grandTotalA - derivedTotalRaw;
  checks.push({
    point: "after_query_export",
    item: "정합성 검산 B — 파생원가 반영(변동비 기준 손익 − 파생원가 = 손익)",
    result: diffB === ZERO ? "통과" : "이상",
    detail:
      `변동비 기준 손익 ${won(grandTotalA)} − 파생원가 합계 ${won(derivedTotalRaw)} = 손익 ${won(realProfitB)} ` +
      `(인건비 ${won(BigInt(derivedSummaryB.labor))} · 이자 ${won(BigInt(derivedSummaryB.interest))} · ` +
      `감가상각 ${won(BigInt(derivedSummaryB.depreciation))}) / raw 합계 대비 분류 합계 차액 ${won(diffB)}`,
    cause: diffB !== ZERO ? "DerivedCost.costType 값이 labor/interest/depreciation 분류에서 하나라도 안 걸림" : undefined,
    action: diffB !== ZERO ? "lib/aggregate.ts getDerivedCostSummary()의 costType 분기 확인" : undefined,
    retryNeeded: diffB !== ZERO,
  });

  // 검사 C: 원본 금액 보존. 인건비(급여대장/4대보험) kind는 변동비가 아니므로 여기서
  // 완전히 제외하고 별도로만 집계한다 — 매입에 섞이면 6,120만원이 이중 계상된다.
  // 나머지 거래는 (손익 반영분 / 메모 확인 대기 / 보류 / 제외) 4개 버킷 중 정확히 하나에만
  // 속해야 하고, 그 합이 원본 총액과 원 단위로 정확히 같아야 한다.
  const [erpTx, laborTx] = await Promise.all([
    prisma.transaction.findMany({
      where: { kind: { notIn: LABOR_KINDS }, amount: { not: null } },
      include: { reviewDecision: true },
    }),
    prisma.transaction.findMany({
      where: { kind: { in: LABOR_KINDS }, amount: { not: null } },
      select: { amount: true },
    }),
  ]);
  let totalAllC = ZERO;
  let includedSumC = ZERO;
  let memoWaitingSumC = ZERO;
  let holdSumC = ZERO;
  let excludedSumC = ZERO;
  for (const t of erpTx) {
    const amt = BigInt(t.amount!);
    totalAllC += amt;
    const status = t.reviewDecision?.status;
    if (status === "hold") holdSumC += amt;
    else if (status === "excluded") excludedSumC += amt;
    else if (status === "needs_review" && t.reviewDecision?.problemType === PROBLEM_TYPE.MEMO_NEEDS_REVIEW) memoWaitingSumC += amt;
    else includedSumC += amt;
  }
  const bucketSumC = includedSumC + memoWaitingSumC + holdSumC + excludedSumC;
  const diffC = totalAllC - bucketSumC;
  const laborTotalC = laborTx.reduce((s, t) => s + BigInt(t.amount!), ZERO);
  checks.push({
    point: "after_query_export",
    item: "정합성 검산 C — 원본 금액 보존(인건비 kind 분리 확인)",
    result: diffC === ZERO ? "통과" : "이상",
    detail:
      `ERP 원본 합계(인건비 제외) ${won(totalAllC)} = 손익 반영 ${won(includedSumC)} + 메모 확인 대기 ${won(memoWaitingSumC)} ` +
      `+ 보류 ${won(holdSumC)} + 제외 ${won(excludedSumC)} (버킷 합 ${won(bucketSumC)}, 차액 ${won(diffC)}) ` +
      `· 인건비(별도 집계, 매입 미포함) ${won(laborTotalC)}`,
    cause: diffC !== ZERO ? "거래가 4개 버킷 중 어디에도 안 잡히거나 중복으로 잡힘" : undefined,
    action: diffC !== ZERO ? "getIncludedTransactions()의 상태 분기 로직 확인" : undefined,
    retryNeeded: diffC !== ZERO,
  });

  // after_calendar_chatbot: 캘린더-분석 결과 연결(회수 합계 = 매출 중 settle_date 보유분 합계).
  // 기존 비교는 기준이 서로 달랐다 — calendarTotal(getCalendarSummary 기준)은 hold/excluded
  // 거래를 빼고 사람이 /calendar에서 직접 추가한 ManualCalendarEntry를 더하는데(calendar.ts),
  // salesWithSettleTotal(SQL 직접 집계)은 hold/excluded를 안 빼고 수동 입력도 없었다.
  // 그래서 /calendar에서 일정을 하나 추가하거나 매출 1건을 보류로 돌리면 실사용에서도
  // 영구히 "이상"이 떴다. 두 값 다 "거래에서 파생된 매출만, hold/excluded 제외" 기준으로
  // 맞춘다 — 수동 입력분은 원본 거래가 없으니 이 항등식 비교에서 뺀다.
  const { entries: calendarEntries } = await getCalendarSummary();
  const txDerivedSalesTotal = calendarEntries
    .filter((e) => e.side === "매출" && !e.isManual)
    .reduce((s, e) => s + e.amount, 0);
  const manualSalesEntries = calendarEntries.filter((e) => e.side === "매출" && e.isManual);
  const manualSalesTotal = manualSalesEntries.reduce((s, e) => s + e.amount, 0);
  const salesWithSettle = await prisma.transaction.aggregate({
    where: {
      side: "매출",
      settleDate: { not: null },
      amount: { not: null },
      NOT: { reviewDecision: { status: { in: ["hold", "excluded"] } } },
    },
    _sum: { amount: true },
  });
  const salesWithSettleTotal = salesWithSettle._sum.amount ?? 0;
  const calendarMismatch = txDerivedSalesTotal !== salesWithSettleTotal;
  checks.push({
    point: "after_calendar_chatbot",
    item: "캘린더-매출 합계 연결",
    result: calendarMismatch ? "이상" : "통과",
    detail:
      `캘린더(거래 기반, hold/excluded 제외) ${txDerivedSalesTotal.toLocaleString()}원 / ` +
      `회수예정일 있는 매출 합계(같은 기준) ${salesWithSettleTotal.toLocaleString()}원` +
      (manualSalesEntries.length > 0
        ? ` · 수동 입력 매출 ${manualSalesEntries.length}건 ${manualSalesTotal.toLocaleString()}원은 원본 거래가 없어 이 비교에서 제외`
        : ""),
    cause: calendarMismatch ? "확정/예정 판정 로직 불일치 의심" : undefined,
    retryNeeded: calendarMismatch,
  });

  const salesWithoutSettle = await prisma.transaction.count({
    where: { side: "매출", settleDate: null },
  });
  checks.push({
    point: "after_calendar_chatbot",
    item: "매출 회수예정일 누락",
    result: salesWithoutSettle > 0 ? "경고" : "통과",
    detail: `매출 중 settle_date 없음 ${salesWithoutSettle}건`,
    cause: salesWithoutSettle > 0 ? "비고 열 형식이 'YYYY-MM-DD 수단'이 아님" : undefined,
    action: salesWithoutSettle > 0 ? "검수 목록에서 원본 비고 값 확인" : undefined,
  });

  return checks;
}

export interface VerifyStatusSummary {
  pass: number;
  warning: number;
  anomaly: number;
  retryNeeded: boolean;
}

export function summarizeVerify(checks: VerifyCheck[]): VerifyStatusSummary {
  return {
    pass: checks.filter((c) => c.result === "통과").length,
    warning: checks.filter((c) => c.result === "경고").length,
    anomaly: checks.filter((c) => c.result === "이상").length,
    retryNeeded: checks.some((c) => c.retryNeeded),
  };
}
