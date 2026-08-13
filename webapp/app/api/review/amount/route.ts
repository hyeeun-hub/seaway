import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyTransaction } from "@/lib/classify";

// "금액 누락" 건 전용: 원본 셀이 비어 있던 실제 금액을 사람이 확인해서 채워 넣는다.
// 이미 금액이 있는 거래는 여기서 건드리지 않는다(원본 값을 덮어쓰는 용도가 아니라,
// 진짜 비어 있던 값을 메꾸는 용도로만 쓴다). 채운 뒤에는 category를 사람이 추측해서
// 넣게 하지 않고 classifyTransaction을 다시 돌려 규칙대로 재분류한다.
export async function POST(request: Request) {
  const body = await request.json();
  const { id, amount } = body as { id?: string; amount?: number };

  if (!id || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "id/amount가 올바르지 않습니다" }, { status: 400 });
  }

  const decision = await prisma.reviewDecision.findUnique({
    where: { id },
    include: { transaction: true },
  });
  if (!decision) {
    return NextResponse.json({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  }
  if (decision.transaction.amount !== null) {
    return NextResponse.json({ error: "이미 금액이 있는 거래입니다" }, { status: 400 });
  }

  const roundedAmount = Math.round(amount);
  await prisma.transaction.update({
    where: { id: decision.transactionId },
    data: { amount: roundedAmount },
  });

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
      amount: roundedAmount,
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

  return NextResponse.json({ decision: updated, amount: roundedAmount });
}
