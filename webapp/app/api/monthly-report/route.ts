import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonthlyPnl, getProjectPnl } from "@/lib/aggregate";
import { generateSummaryText } from "@/lib/monthlyReport";

const VALID_ACTIONS = ["save", "confirm", "regenerate"] as const;

export async function POST(request: Request) {
  const body = await request.json();
  const { month, summaryText, action } = body as {
    month?: string;
    summaryText?: string;
    action?: string;
  };

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month가 올바르지 않습니다" }, { status: 400 });
  }
  if (!action || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return NextResponse.json({ error: "action이 올바르지 않습니다" }, { status: 400 });
  }

  let text = summaryText ?? "";
  if (action === "regenerate") {
    const [monthlyRows, projectRows] = await Promise.all([
      getMonthlyPnl(),
      getProjectPnl({ month }),
    ]);
    text = generateSummaryText(month, monthlyRows, projectRows);
  } else if (!text.trim()) {
    return NextResponse.json({ error: "요약 문구가 비어 있습니다" }, { status: 400 });
  }

  const state = await prisma.monthlyReportState.upsert({
    where: { month },
    update: {
      summaryText: text,
      confirmedAt: action === "confirm" ? new Date() : action === "regenerate" ? null : undefined,
    },
    create: {
      month,
      summaryText: text,
      confirmedAt: action === "confirm" ? new Date() : null,
    },
  });

  return NextResponse.json({ state });
}
