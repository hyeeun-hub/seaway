import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_MATCH_ON = ["proj", "flag_review", "place_keyword", "memo_keyword"] as const;

export async function GET() {
  const rules = await prisma.adminCategoryRule.findMany({ orderBy: [{ matchOn: "asc" }, { pattern: "asc" }] });
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { matchOn, pattern, category } = body as {
    matchOn?: string;
    pattern?: string;
    category?: string;
  };

  if (!matchOn || !VALID_MATCH_ON.includes(matchOn as typeof VALID_MATCH_ON[number])) {
    return NextResponse.json({ error: "matchOn이 올바르지 않습니다" }, { status: 400 });
  }
  if (!pattern?.trim() || !category?.trim()) {
    return NextResponse.json({ error: "pattern/category를 입력하세요" }, { status: 400 });
  }

  const rule = await prisma.adminCategoryRule.upsert({
    where: { matchOn_pattern: { matchOn, pattern: pattern.trim() } },
    update: { category: category.trim() },
    create: { matchOn, pattern: pattern.trim(), category: category.trim() },
  });

  return NextResponse.json({ rule });
}
