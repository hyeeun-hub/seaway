import { NextResponse } from "next/server";
import { recomputeDerivedCosts } from "@/lib/derivedCost";

// 화면 트리거는 /settings 마스터 데이터 탭의 RecomputeDerivedCostButton.
export async function POST() {
  try {
    const result = await recomputeDerivedCosts();
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
