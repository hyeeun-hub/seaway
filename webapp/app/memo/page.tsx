import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { MemoRow } from "@/components/MemoRow";
import { AcknowledgedMemoRow } from "@/components/AcknowledgedMemoRow";
import { getReviewSummary } from "@/lib/aggregate";
import { PROBLEM_TYPE } from "@/lib/problemTypes";

export const dynamic = "force-dynamic";

export default async function MemoPage() {
  const [decisions, reviewSummary] = await Promise.all([
    prisma.reviewDecision.findMany({
      where: { transaction: { memo: { not: "" } } },
      include: { transaction: true },
    }),
    getReviewSummary(),
  ]);

  const unchecked = decisions.filter((d) => !d.memoAcknowledgedAt);
  const acknowledged = decisions
    .filter((d) => d.memoAcknowledgedAt)
    .sort((a, b) => (b.memoAcknowledgedAt?.getTime() ?? 0) - (a.memoAcknowledgedAt?.getTime() ?? 0));

  // 위험 신호 건은 상단 고정, 나머지는 금액 내림차순.
  const risky = unchecked.filter((d) => d.problemType === PROBLEM_TYPE.MEMO_NEEDS_REVIEW);
  const rest = unchecked
    .filter((d) => d.problemType !== PROBLEM_TYPE.MEMO_NEEDS_REVIEW)
    .sort((a, b) => (b.transaction.amount ?? 0) - (a.transaction.amount ?? 0));
  const ordered = [...risky, ...rest];

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="메모 확인"
        subtitle={`메모가 있는 거래 ${decisions.length}건 · 위험 신호 ${risky.length}건 — 손익 반영 여부와 무관하게 전부 표시합니다`}
        reviewCount={reviewSummary.needsReview}
      />

      <Card padding="py-2">
        <ul className="divide-y divide-slate-50 px-3">
          {ordered.map((d) => (
            <MemoRow
              key={d.id}
              id={d.id}
              status={d.status}
              problemType={d.problemType}
              transaction={{
                date: d.transaction.date,
                place: d.transaction.place,
                proj: d.transaction.proj,
                amount: d.transaction.amount,
                memo: d.transaction.memo,
              }}
            />
          ))}
          {ordered.length === 0 && (
            <li className="py-6 text-sm text-slate-400">확인할 메모가 없습니다</li>
          )}
        </ul>
      </Card>

      <header className="pt-2">
        <h2 className="text-sm font-bold text-slate-900">확인된 항목</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          잘못 확인했다면 확인 취소를 눌러 위 목록으로 다시 보낼 수 있습니다.
        </p>
      </header>
      <Card padding="py-2">
        <ul className="divide-y divide-slate-50 px-3">
          {acknowledged.map((d) => (
            <AcknowledgedMemoRow
              key={d.id}
              id={d.id}
              transaction={{
                date: d.transaction.date,
                place: d.transaction.place,
                proj: d.transaction.proj,
                amount: d.transaction.amount,
                memo: d.transaction.memo,
              }}
            />
          ))}
          {acknowledged.length === 0 && (
            <li className="py-6 text-sm text-slate-400">확인된 항목이 없습니다</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
