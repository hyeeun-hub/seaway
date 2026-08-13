import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractKeywordCandidates } from "@/lib/memoKeyword";
import { PROBLEM_TYPE } from "@/lib/problemTypes";

const VALID_ACTIONS = ["flag", "ack", "unack"] as const;

export async function POST(request: Request) {
  const body = await request.json();
  const { id, action } = body as { id?: string; action?: string };

  if (!id || !action || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return NextResponse.json({ error: "id/action이 올바르지 않습니다" }, { status: 400 });
  }

  const decision = await prisma.reviewDecision.findUnique({
    where: { id },
    include: { transaction: true },
  });
  if (!decision) {
    return NextResponse.json({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  }

  if (action === "ack") {
    // 확인함: 손익/분류는 그대로 두고 확인 시각만 남긴다. "확인된 항목" 목록으로 옮겨간다
    // (데이터 삭제가 아니라 화면 구획만 이동 — 언제든 확인 취소로 되돌릴 수 있다).
    const updated = await prisma.reviewDecision.update({
      where: { id },
      data: { memoAcknowledgedAt: new Date() },
    });
    return NextResponse.json({ decision: updated });
  }

  if (action === "unack") {
    // 확인 취소: 실수로 확인 눌렀을 때 다시 메인 목록으로 되돌린다.
    const updated = await prisma.reviewDecision.update({
      where: { id },
      data: { memoAcknowledgedAt: null },
    });
    return NextResponse.json({ decision: updated });
  }

  // 문제 있음: 규칙이 못 잡은 메모라도 사람이 위험하다고 판단하면 강제로 검수/제외 대상으로
  // 전환한다(classifyTransaction을 다시 돌리지 않는다 — 아직 키워드가 등록 전이라 규칙상으로는
  // 위험 신호가 아니라고 나올 수 있기 때문에, 사람의 판단을 그대로 반영해야 한다).
  const updated = await prisma.reviewDecision.update({
    where: { id },
    data: {
      status: "needs_review",
      problemType: PROBLEM_TYPE.MEMO_NEEDS_REVIEW,
      suggestion: `사용자가 문제로 표시함. 원본 메모: "${decision.transaction.memo}"`,
      resolvedCategory: null,
      decidedAt: null,
    },
  });

  const candidates = extractKeywordCandidates(decision.transaction.memo);
  return NextResponse.json({ decision: updated, candidates });
}
