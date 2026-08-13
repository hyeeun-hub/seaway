import { prisma } from "@/lib/prisma";
import { parseGenericSheet } from "./genericSheet";
import { normalizeString, normalizeAmount, normalizeDate } from "./normalize";

export interface MasterIngestSummary {
  fileName: string;
  kind: string;
  status: "processed" | "rejected";
  rowCount: number;
  upserted: number;
  anomalies: string[];
}

function toBigInt(v: unknown): bigint | null {
  const n = normalizeAmount(v);
  return n === null ? null : BigInt(n);
}

const ZERO = BigInt(0);

function toIntOrZero(v: unknown): number {
  return normalizeAmount(v) ?? 0;
}

const PROJECT_REQUIRED = [
  "프로젝트코드",
  "프로젝트/현장",
  "구분",
  "발주처",
  "계약금액",
  "착공일",
  "준공예정일",
  "현장위치",
  "상태",
];

// 마스터는 upsert가 맞다(대출 이율이 바뀌면 갱신) — 파일 해시 1차 방어선을 적용하지 않는다.
// 프로젝트명은 Transaction.proj와 조인되는 키라 trim 외의 가공을 하지 않는다.
export async function ingestProjectMaster(fileName: string, buffer: Buffer): Promise<MasterIngestSummary> {
  const parsed = parseGenericSheet(buffer, PROJECT_REQUIRED);
  if (parsed.anomalies.length > 0) {
    return { fileName, kind: "마스터-프로젝트", status: "rejected", rowCount: 0, upserted: 0, anomalies: parsed.anomalies };
  }

  let upserted = 0;
  const anomalies: string[] = [];
  const now = new Date();

  for (const row of parsed.rows) {
    const projectCode = normalizeString(row["프로젝트코드"]);
    const projectName = normalizeString(row["프로젝트/현장"]);
    if (!projectCode || !projectName) {
      anomalies.push(`프로젝트코드/프로젝트명 공백 행 건너뜀(행: ${JSON.stringify(row)})`);
      continue;
    }

    const startDateStr = normalizeDate(row["착공일"]);
    const endDateStr = normalizeDate(row["준공예정일"]);

    const data = {
      projectName,
      category: normalizeString(row["구분"]),
      client: normalizeString(row["발주처"]) || null,
      contractAmt: toBigInt(row["계약금액"]),
      startDate: startDateStr ? new Date(startDateStr) : null,
      endDate: endDateStr ? new Date(endDateStr) : null,
      location: normalizeString(row["현장위치"]) || null,
      status: normalizeString(row["상태"]) || null,
    };

    await prisma.project.upsert({
      where: { projectCode },
      update: data,
      create: { projectCode, ...data, isAutoAdded: false, firstSeenAt: now },
    });
    upserted++;
  }

  return { fileName, kind: "마스터-프로젝트", status: "processed", rowCount: parsed.rows.length, upserted, anomalies };
}

const LOAN_REQUIRED = [
  "대출코드",
  "금융기관",
  "종류",
  "원금",
  "연이율(%)",
  "실행일",
  "만기일",
  "상환방식",
  "귀속구분",
  "귀속프로젝트",
  "비고",
];

export async function ingestLoanMaster(fileName: string, buffer: Buffer): Promise<MasterIngestSummary> {
  const parsed = parseGenericSheet(buffer, LOAN_REQUIRED);
  if (parsed.anomalies.length > 0) {
    return { fileName, kind: "마스터-대출", status: "rejected", rowCount: 0, upserted: 0, anomalies: parsed.anomalies };
  }

  let upserted = 0;
  const anomalies: string[] = [];

  for (const row of parsed.rows) {
    const loanCode = normalizeString(row["대출코드"]);
    if (!loanCode) {
      anomalies.push(`대출코드 공백 행 건너뜀`);
      continue;
    }

    const startDateStr = normalizeDate(row["실행일"]);
    const endDateStr = normalizeDate(row["만기일"]);
    if (!startDateStr || !endDateStr) {
      anomalies.push(`${loanCode}: 실행일/만기일 파싱 실패, 건너뜀`);
      continue;
    }

    // 연이율은 공백일 수 있다(더미 L03) — 0으로 채우지 않고 null로 둔다(state-schema.md §5).
    const rateRaw = row["연이율(%)"];
    const rateNum = rateRaw === "" || rateRaw === undefined || rateRaw === null ? NaN : Number(rateRaw);
    const annualRate = Number.isFinite(rateNum) ? rateNum : null;

    const data = {
      bank: normalizeString(row["금융기관"]),
      loanType: normalizeString(row["종류"]),
      principal: toBigInt(row["원금"]) ?? ZERO,
      annualRate,
      startDate: new Date(startDateStr),
      endDate: new Date(endDateStr),
      repayMethod: normalizeString(row["상환방식"]),
      scope: normalizeString(row["귀속구분"]),
      projectName: normalizeString(row["귀속프로젝트"]) || null,
      note: normalizeString(row["비고"]) || null,
    };

    await prisma.loan.upsert({
      where: { loanCode },
      update: data,
      create: { loanCode, ...data },
    });
    upserted++;
  }

  return { fileName, kind: "마스터-대출", status: "processed", rowCount: parsed.rows.length, upserted, anomalies };
}

const ASSET_REQUIRED = [
  "자산코드",
  "자산명",
  "계정",
  "취득일",
  "취득가액",
  "내용연수(년)",
  "상각방법",
  "잔존가액",
  "귀속구분",
  "귀속프로젝트",
  "월상각액",
  "비고",
];

export async function ingestAssetMaster(fileName: string, buffer: Buffer): Promise<MasterIngestSummary> {
  const parsed = parseGenericSheet(buffer, ASSET_REQUIRED);
  if (parsed.anomalies.length > 0) {
    return { fileName, kind: "마스터-자산", status: "rejected", rowCount: 0, upserted: 0, anomalies: parsed.anomalies };
  }

  let upserted = 0;
  const anomalies: string[] = [];

  for (const row of parsed.rows) {
    const assetCode = normalizeString(row["자산코드"]);
    if (!assetCode) {
      anomalies.push(`자산코드 공백 행 건너뜀`);
      continue;
    }

    const acquireDateStr = normalizeDate(row["취득일"]);
    if (!acquireDateStr) {
      anomalies.push(`${assetCode}: 취득일 파싱 실패, 건너뜀`);
      continue;
    }

    const data = {
      name: normalizeString(row["자산명"]),
      account: normalizeString(row["계정"]),
      acquireDate: new Date(acquireDateStr),
      acquireCost: toBigInt(row["취득가액"]) ?? ZERO,
      usefulYears: toIntOrZero(row["내용연수(년)"]),
      depMethod: normalizeString(row["상각방법"]),
      residualValue: toIntOrZero(row["잔존가액"]),
      scope: normalizeString(row["귀속구분"]),
      projectName: normalizeString(row["귀속프로젝트"]) || null,
      monthlyDep: toIntOrZero(row["월상각액"]),
      note: normalizeString(row["비고"]) || null,
    };

    await prisma.asset.upsert({
      where: { assetCode },
      update: data,
      create: { assetCode, ...data },
    });
    upserted++;
  }

  return { fileName, kind: "마스터-자산", status: "processed", rowCount: parsed.rows.length, upserted, anomalies };
}
