import { NextResponse } from "next/server";
import { reclassifyAllTransactions } from "@/lib/reclassify";

export async function POST() {
  const result = await reclassifyAllTransactions();
  return NextResponse.json({ result });
}
