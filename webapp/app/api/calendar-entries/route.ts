import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();
  const { date, label, amount, side } = body as {
    date?: string;
    label?: string;
    amount?: number;
    side?: string;
  };

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date는 YYYY-MM-DD 형식이어야 합니다" }, { status: 400 });
  }
  if (!label?.trim()) {
    return NextResponse.json({ error: "거래처/설명을 입력하세요" }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "금액을 입력하세요" }, { status: 400 });
  }

  const entry = await prisma.manualCalendarEntry.create({
    data: {
      date,
      label: label.trim(),
      amount: Math.round(amount),
      side: side === "매입" ? "매입" : "매출",
    },
  });

  return NextResponse.json({ entry });
}
