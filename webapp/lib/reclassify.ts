import { prisma } from "@/lib/prisma";
import { classifyTransaction } from "@/lib/classify";

// 사람이 /review에서 확정/제외/수정/보류한 건은 규칙이 바뀌어도 절대 덮어쓰지 않는다.
const PROTECTED_STATUSES = ["confirmed", "excluded", "modified", "hold"];

export interface ReclassifyResult {
  reevaluated: number;
  changed: number;
  skippedProtected: number;
}

// AdminCategoryRule을 추가/수정하거나 classify.ts의 판정 로직을 바꾼 뒤, 아직 사람이 손대지
// 않은 거래(needs_review/auto_confirmed)만 classifyTransaction으로 다시 판정해
// ReviewDecision을 갱신한다. 새 Transaction을 만들지는 않는다(원본은 항상 보존).
export async function reclassifyAllTransactions(): Promise<ReclassifyResult> {
  const rules = (await prisma.adminCategoryRule.findMany()).sort(
    (a, b) => b.pattern.length - a.pattern.length,
  );

  const decisions = await prisma.reviewDecision.findMany({ include: { transaction: true } });

  let changed = 0;
  let reevaluated = 0;
  let skippedProtected = 0;

  for (const d of decisions) {
    if (PROTECTED_STATUSES.includes(d.status)) {
      skippedProtected++;
      continue;
    }
    reevaluated++;

    const tx = d.transaction;
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
    const resolvedCategory = result.status === "auto_confirmed" ? result.suggestedCategory : null;

    if (
      d.status !== result.status ||
      d.problemType !== result.problemType ||
      d.resolvedCategory !== resolvedCategory
    ) {
      changed++;
    }

    await prisma.reviewDecision.update({
      where: { id: d.id },
      data: {
        problemType: result.problemType,
        suggestion: result.suggestion,
        suggestedCategory: result.suggestedCategory,
        status: result.status,
        resolvedCategory,
        decidedAt: result.status === "auto_confirmed" ? new Date() : null,
      },
    });
  }

  return { reevaluated, changed, skippedProtected };
}
