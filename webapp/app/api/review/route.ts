import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyTransaction } from "@/lib/classify";
import { PROBLEM_TYPE } from "@/lib/problemTypes";

const VALID_STATUSES = ["confirmed", "excluded", "modified", "hold", "needs_review"] as const;

export async function POST(request: Request) {
  const body = await request.json();
  const { id, status, resolvedCategory, note } = body as {
    id?: string;
    status?: string;
    resolvedCategory?: string | null;
    note?: string | null;
  };

  if (!id || !status || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ error: "id/status가 올바르지 않습니다" }, { status: 400 });
  }

  const decision = await prisma.reviewDecision.findUnique({
    where: { id },
    include: { transaction: true },
  });
  if (!decision) {
    return NextResponse.json({ error: "검수 대상을 찾을 수 없습니다" }, { status: 404 });
  }

  // 되돌리기: 사람이 내린 확정/제외/수정/보류 결정을 취소하고 검수 목록으로 되돌린다.
  // 사람이 지정한 값(resolvedCategory/note)은 지우고, 규칙 기반 판정 결과를 새로 계산해
  // problemType/suggestion을 최신 상태로 맞춘다.
  if (status === "needs_review") {
    const rules = (await prisma.adminCategoryRule.findMany()).sort(
      (a, b) => b.pattern.length - a.pattern.length,
    );
    const tx = decision.transaction;
    const result = classifyTransaction(
      {
        kind: tx.kind,
        proj: tx.proj,
        use: tx.use,
        content: tx.content,
        place: tx.place,
        amount: tx.amount,
        noteRaw: tx.noteRaw,
        settleDate: tx.settleDate,
        memo: tx.memo,
      },
      rules,
    );
    const updated = await prisma.reviewDecision.update({
      where: { id },
      data: {
        status: "needs_review",
        problemType: result.problemType,
        suggestion: result.suggestion,
        suggestedCategory: result.suggestedCategory,
        resolvedCategory: null,
        note: null,
        decidedAt: null,
      },
    });
    return NextResponse.json({ decision: updated });
  }

  // 사람이 분류/현장을 지정해 확정한 blank-proj 거래는 일반관리비 집계에도 잡히도록
  // problemType을 맞춰준다(proj가 비어 있는 채로는 프로젝트별 손익에도, 일반관리비
  // 분류에도 잡히지 않아 조용히 사라지는 걸 막는다).
  const problemType =
    (status === "confirmed" || status === "modified") &&
    resolvedCategory &&
    decision.transaction.proj === ""
      ? PROBLEM_TYPE.GENERAL_ADMIN
      : decision.problemType;

  const updated = await prisma.reviewDecision.update({
    where: { id },
    data: {
      status,
      resolvedCategory: resolvedCategory ?? decision.resolvedCategory,
      note: note ?? decision.note,
      problemType,
      decidedAt: new Date(),
    },
  });

  return NextResponse.json({ decision: updated });
}
