import { prisma } from "@/lib/prisma";
import { ReviewRow } from "@/components/ReviewRow";
import { DecidedItemRow } from "@/components/DecidedItemRow";
import { Card } from "@/components/Card";
import { findReviewHint } from "@/lib/reviewHints";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const { type, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [items, total, grouped, decidedItems, placeKeywordRules] = await Promise.all([
    prisma.reviewDecision.findMany({
      where: { status: "needs_review", ...(type ? { problemType: type } : {}) },
      include: { transaction: true },
      orderBy: [
        { transaction: { amount: { sort: "desc", nulls: "last" } } },
        { createdAt: "asc" },
      ],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.reviewDecision.count({
      where: { status: "needs_review", ...(type ? { problemType: type } : {}) },
    }),
    prisma.reviewDecision.groupBy({
      by: ["problemType"],
      where: { status: "needs_review" },
      _count: true,
    }),
    prisma.reviewDecision.findMany({
      where: { status: { in: ["confirmed", "modified", "excluded", "hold"] } },
      include: { transaction: true },
      orderBy: { decidedAt: "desc" },
      take: 20,
    }),
    prisma.adminCategoryRule.findMany({ where: { matchOn: "place_keyword" }, select: { pattern: true } }),
  ]);
  const existingPlaceKeywords = placeKeywordRules.map((r) => r.pattern);

  // 프로젝트/현장이 공백인 검수 건에만 "유사 거래 참고" 힌트를 계산한다.
  // 후보 풀은 현장이 지정된 거래만 필요하다(값 비교만 하므로 가볍다). "사무실운영"/"연구전담부서"
  // 같은 일반관리비 전용 proj 값은 실제 현장이 아니라서 후보에서 뺀다 — 안 빼면 항공권 비용을
  // "연구전담부서"로 지정하라는 식의 엉뚱한 힌트가 나올 수 있다.
  const needsHint = items.some((it) => it.transaction.proj === "");
  const [rawHintPool, adminProjRules] = needsHint
    ? await Promise.all([
        prisma.transaction.findMany({
          where: { proj: { not: "" } },
          select: { place: true, proj: true, date: true },
        }),
        prisma.adminCategoryRule.findMany({ where: { matchOn: "proj" }, select: { pattern: true } }),
      ])
    : [[], []];
  const adminProjSet = new Set(adminProjRules.map((r) => r.pattern));
  const hintPool = rawHintPool.filter((t) => !adminProjSet.has(t.proj));
  const hints = new Map(
    items
      .filter((it) => it.transaction.proj === "")
      .map((it) => [
        it.id,
        findReviewHint(
          { place: it.transaction.place, date: it.transaction.date },
          hintPool,
          placeKeywordRules,
        ),
      ]),
  );

  const totalNeedsReview = grouped.reduce((s, g) => s + g._count, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">검수 대상</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          규칙으로 딱 맞는 건 이미 자동 처리됐습니다. 여기 남은 {totalNeedsReview}건만 확인하면 됩니다.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        <a
          href="/review"
          className={`rounded-full border px-2.5 py-1 ${
            !type ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500"
          }`}
        >
          전체 {totalNeedsReview}
        </a>
        {grouped.map((g) => (
          <a
            key={g.problemType}
            href={`/review?type=${encodeURIComponent(g.problemType)}`}
            className={`rounded-full border px-2.5 py-1 ${
              type === g.problemType
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-500"
            }`}
          >
            {g.problemType} {g._count}
          </a>
        ))}
      </div>

      <Card padding="py-2">
        <ul className="divide-y divide-slate-50 px-3">
          {items.map((it) => (
            <ReviewRow
              key={it.id}
              id={it.id}
              problemType={it.problemType}
              suggestion={it.suggestion}
              suggestedCategory={it.suggestedCategory}
              transaction={{
                date: it.transaction.date,
                place: it.transaction.place,
                proj: it.transaction.proj,
                amount: it.transaction.amount,
                kind: it.transaction.kind,
                use: it.transaction.use,
                content: it.transaction.content,
              }}
              existingPlaceKeywords={existingPlaceKeywords}
              hint={hints.get(it.id) ?? null}
            />
          ))}
          {items.length === 0 && (
            <li className="py-6 text-sm text-slate-400">확인이 필요한 거래가 없습니다</li>
          )}
        </ul>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-1 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/review?${type ? `type=${encodeURIComponent(type)}&` : ""}page=${p}`}
              className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                p === page ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}

      <header className="pt-2">
        <h2 className="text-sm font-bold text-slate-900">최근 처리 항목</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          잘못 처리했다면 되돌리기를 눌러 검수 목록으로 다시 보낼 수 있습니다.
        </p>
      </header>
      <Card padding="py-2">
        <ul className="divide-y divide-slate-50 px-3">
          {decidedItems.map((it) => (
            <DecidedItemRow
              key={it.id}
              id={it.id}
              status={it.status}
              resolvedCategory={it.resolvedCategory}
              transaction={{
                date: it.transaction.date,
                place: it.transaction.place,
                proj: it.transaction.proj,
                amount: it.transaction.amount,
              }}
            />
          ))}
          {decidedItems.length === 0 && (
            <li className="py-6 text-sm text-slate-400">최근 처리한 항목이 없습니다</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
