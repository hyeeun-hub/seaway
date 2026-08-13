import { prisma } from "@/lib/prisma";
import { PROBLEM_TYPE } from "@/lib/problemTypes";

// 서버가 어느 타임존에서 돌든(Vercel은 UTC) 한국 기준 날짜로 확정/예정을 가른다.
export function todayInKorea(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export interface CalendarEntry {
  id: string;
  settleDate: string;
  settleMethod: string | null;
  proj: string;
  place: string;
  amount: number;
  side: string;
  status: "확정" | "예정";
  isPassThrough: boolean;
  isManual: boolean;
}

// state-schema.md §6: settle_date <= 오늘 → 확정, > 오늘 → 예정, null → 캘린더 비대상.
// 거래에서 파싱된 일정 + 사람이 /calendar에서 직접 추가한 일정(ManualCalendarEntry)을 합친다.
export async function getCalendarEntries(): Promise<CalendarEntry[]> {
  const today = todayInKorea();
  const [txs, manualEntries] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        settleDate: { not: null },
        amount: { not: null },
        NOT: { reviewDecision: { status: { in: ["hold", "excluded"] } } },
      },
      include: { reviewDecision: true },
    }),
    prisma.manualCalendarEntry.findMany(),
  ]);

  const fromTx: CalendarEntry[] = txs
    .filter((t) => t.amount !== null && t.settleDate !== null)
    .map((t) => ({
      id: t.id,
      settleDate: t.settleDate as string,
      settleMethod: t.settleMethod,
      proj: t.proj,
      place: t.place,
      amount: t.amount as number,
      side: t.side,
      status: (t.settleDate as string) <= today ? "확정" : "예정",
      isPassThrough: t.reviewDecision?.problemType === PROBLEM_TYPE.GENERAL_ADMIN ? false : t.proj === "창조이엔지",
      isManual: false,
    }));

  const fromManual: CalendarEntry[] = manualEntries.map((m) => ({
    id: m.id,
    settleDate: m.date,
    settleMethod: null,
    proj: "",
    place: m.label,
    amount: m.amount,
    side: m.side,
    status: m.date <= today ? "확정" : "예정",
    isPassThrough: false,
    isManual: true,
  }));

  return [...fromTx, ...fromManual].sort((a, b) => a.settleDate.localeCompare(b.settleDate));
}

export interface CalendarSummary {
  // 매출(수금) 쪽
  confirmedCount: number;
  confirmedAmount: number;
  pendingCount: number;
  pendingAmount: number;
  // 매입(결제) 쪽
  purchaseConfirmedCount: number;
  purchaseConfirmedAmount: number;
  purchasePendingCount: number;
  purchasePendingAmount: number;
  excludedNoSettle: number; // settle_date 없는 매입(현금·카드 즉시결제로 추정)
}

export async function getCalendarSummary(): Promise<{
  entries: CalendarEntry[];
  summary: CalendarSummary;
}> {
  const entries = await getCalendarEntries();
  const salesConfirmed = entries.filter((e) => e.status === "확정" && e.side === "매출");
  const salesPending = entries.filter((e) => e.status === "예정" && e.side === "매출");
  const purchaseConfirmed = entries.filter((e) => e.status === "확정" && e.side === "매입");
  const purchasePending = entries.filter((e) => e.status === "예정" && e.side === "매입");

  const excludedNoSettle = await prisma.transaction.count({
    where: {
      side: "매입",
      settleDate: null,
      NOT: { reviewDecision: { status: { in: ["hold", "excluded"] } } },
    },
  });

  return {
    entries,
    summary: {
      confirmedCount: salesConfirmed.length,
      confirmedAmount: salesConfirmed.reduce((s, e) => s + e.amount, 0),
      pendingCount: salesPending.length,
      pendingAmount: salesPending.reduce((s, e) => s + e.amount, 0),
      purchaseConfirmedCount: purchaseConfirmed.length,
      purchaseConfirmedAmount: purchaseConfirmed.reduce((s, e) => s + e.amount, 0),
      purchasePendingCount: purchasePending.length,
      purchasePendingAmount: purchasePending.reduce((s, e) => s + e.amount, 0),
      excludedNoSettle,
    },
  };
}

export interface MemoNoteEntry {
  id: string;
  date: string;
  place: string;
  proj: string;
  amount: number | null;
  memo: string;
}

// 메모(memo)는 비고(settle_date 파싱 대상)와 다른 자유 서술 필드라 형식이 제각각이다.
// "5월8일 전에 해결"처럼 지급 일정을 언급해도 자동 파싱하지 않는다(오판정 위험) —
// 대신 참고용으로 원문만 나열해 대표가 직접 확인하게 한다. 손익 왜곡 위험으로 검수
// (needs_review, "메모 확인 필요")로 넘어간 건은 /review에서 다뤄야 하므로 제외한다.
export async function getMemoNoteEntries(): Promise<MemoNoteEntry[]> {
  const txs = await prisma.transaction.findMany({
    where: {
      memo: { not: "" },
      NOT: { reviewDecision: { status: { in: ["hold", "excluded"] } } },
    },
    include: { reviewDecision: true },
    orderBy: { date: "asc" },
  });
  return txs
    .filter((t) => t.reviewDecision?.problemType !== PROBLEM_TYPE.MEMO_NEEDS_REVIEW)
    .map((t) => ({ id: t.id, date: t.date, place: t.place, proj: t.proj, amount: t.amount, memo: t.memo }));
}
