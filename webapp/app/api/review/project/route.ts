import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyTransaction } from "@/lib/classify";

// "유사 거래 참고" 힌트에서 [이 현장으로 지정]을 눌렀을 때만 호출된다 — 절대 자동 실행되지 않는다.
// 금액 누락과 같은 패턴: 진짜 비어 있던 값(proj)을 사람이 확인해서 채우고, 그 다음은
// classifyTransaction이 다시 판정한다. 카테고리를 사람이 대신 추측해서 넣지 않는다.
export async function POST(request: Request) {
  const body = await request.json();
  const { id, proj } = body as { id?: string; proj?: string };

  if (!id || !proj?.trim()) {
    return NextResponse.json({ error: "id/proj가 올바르지 않습니다" }, { status: 400 });
  }

  const decision = await prisma.reviewDecision.findUnique({
    where: { id },
    include: { transaction: true },
  });
  if (!decision) {
    return NextResponse.json({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  }
  if (decision.transaction.proj !== "") {
    return NextResponse.json({ error: "이미 현장이 지정된 거래입니다" }, { status: 400 });
  }

  const projValue = proj.trim();
  await prisma.transaction.update({
    where: { id: decision.transactionId },
    data: { proj: projValue },
  });

  const rules = (await prisma.adminCategoryRule.findMany()).sort(
    (a, b) => b.pattern.length - a.pattern.length,
  );
  const tx = decision.transaction;
  const result = classifyTransaction(
    {
      kind: tx.kind,
      proj: projValue,
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
      status: result.status,
      problemType: result.problemType,
      suggestion: result.suggestion,
      suggestedCategory: result.suggestedCategory,
      resolvedCategory: result.status === "auto_confirmed" ? result.suggestedCategory : null,
      decidedAt: result.status === "auto_confirmed" ? new Date() : null,
    },
  });

  return NextResponse.json({ decision: updated, proj: projValue });
}
