import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 계약금액은 추정하거나 자동으로 채우지 않는다 — 사람이 직접 입력한 값만 저장한다.
export async function POST(request: Request) {
  const body = await request.json();
  const { projectName, contractAmt } = body as { projectName?: string; contractAmt?: number };

  if (!projectName || typeof contractAmt !== "number" || !Number.isFinite(contractAmt) || contractAmt <= 0) {
    return NextResponse.json({ error: "projectName/contractAmt가 올바르지 않습니다" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { projectName } });
  if (!project) {
    return NextResponse.json({ error: "프로젝트 마스터를 찾을 수 없습니다" }, { status: 404 });
  }

  const updated = await prisma.project.update({
    where: { projectName },
    data: { contractAmt: BigInt(Math.round(contractAmt)) },
  });

  return NextResponse.json({ contractAmt: updated.contractAmt!.toString() });
}
