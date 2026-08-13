import { prisma } from "@/lib/prisma";
import { classifyTransaction } from "@/lib/classify";
import { detectKind } from "./detectKind";
import { parseSheet } from "./parseSheet";
import { parseLaborSheet } from "./parseLaborSheet";
import { normalizeString, normalizeDate, normalizeAmount, monthOf } from "./normalize";
import { parseSettle } from "./parseSettle";
import { computeTxKey, assignSeq } from "./txKey";
import { computeFileHash } from "./fileHash";
import { sideOf, isMasterKind, isLaborKind, type Kind, type PreparedTransaction } from "./types";
import { ingestProjectMaster, ingestLoanMaster, ingestAssetMaster } from "./ingestMaster";

export interface IngestSummary {
  fileName: string;
  fileHash: string;
  kind: Kind | null;
  status: "processed" | "skipped_duplicate" | "rejected";
  rowCount: number;
  txAdded: number;
  txSkippedDuplicate: number;
  txTotal: number;
  anomalies: string[];
}

export async function ingestFile(
  fileName: string,
  buffer: Buffer,
): Promise<IngestSummary> {
  const fileHash = computeFileHash(buffer);
  const kind = detectKind(fileName);

  // 마스터 파일(대출/자산/프로젝트)은 upsert 대상이라 파일 해시 1차 방어선을 적용하지 않는다
  // (같은 파일 재업로드 = 정상 갱신). Transaction도 만들지 않는다.
  if (kind && isMasterKind(kind)) {
    return ingestMasterKind(fileName, buffer, kind, fileHash);
  }

  // 1차 방어선: 파일 해시가 이미 처리 기록에 있으면 파싱하지 않고 스킵한다(state-schema.md §4).
  const existing = await prisma.processedFile.findUnique({
    where: { fileHash },
  });
  if (existing) {
    return {
      fileName,
      fileHash,
      kind: existing.kind as Kind | null,
      status: "skipped_duplicate",
      rowCount: existing.rowCount ?? 0,
      txAdded: 0,
      txSkippedDuplicate: existing.rowCount ?? 0,
      txTotal: await prisma.transaction.count(),
      anomalies: [],
    };
  }

  if (!kind) {
    const anomalies = [
      "파일명이 state-schema.md §3 매핑표의 인식 가능한 패턴과 일치하지 않음. 추측하지 않고 접수를 거부함",
    ];
    await prisma.processedFile.create({
      data: {
        fileHash,
        fileName,
        sizeBytes: buffer.length,
        kind: null,
        status: "rejected",
        anomalies,
      },
    });
    return {
      fileName,
      fileHash,
      kind: null,
      status: "rejected",
      rowCount: 0,
      txAdded: 0,
      txSkippedDuplicate: 0,
      txTotal: await prisma.transaction.count(),
      anomalies,
    };
  }

  const parsed = isLaborKind(kind) ? parseLaborSheet(buffer, kind) : parseSheet(buffer, kind);
  if (parsed.anomalies.length > 0) {
    await prisma.processedFile.create({
      data: {
        fileHash,
        fileName,
        sizeBytes: buffer.length,
        kind,
        sheet: parsed.sheet,
        status: "rejected",
        anomalies: parsed.anomalies,
      },
    });
    return {
      fileName,
      fileHash,
      kind,
      status: "rejected",
      rowCount: 0,
      txAdded: 0,
      txSkippedDuplicate: 0,
      txTotal: await prisma.transaction.count(),
      anomalies: parsed.anomalies,
    };
  }

  const side = sideOf(kind);

  const prepared: PreparedTransaction[] = assignSeq(
    parsed.rows.map((raw) => {
      const date = normalizeDate(raw.date) ?? "";
      const settle = parseSettle(raw.note);
      const amount = normalizeAmount(raw.amount);
      const proj = normalizeString(raw.proj);
      const use = normalizeString(raw.use);
      const content = normalizeString(raw.content);
      const place = normalizeString(raw.place);

      const txKey = computeTxKey({ kind, date, place, amount, proj, use, content });

      return {
        rowIndex: raw.rowIndex,
        date,
        month: date ? monthOf(date) : "",
        place,
        amount,
        evidence: normalizeString(raw.evidence),
        payer: raw.payer === undefined ? null : normalizeString(raw.payer) || null,
        use,
        content,
        proj,
        settleDate: settle.settleDate,
        settleMethod: settle.settleMethod,
        noteRaw: settle.noteRaw,
        memo: normalizeString(raw.memo),
        kind,
        side,
        txKey,
        seq: 0, // assignSeq가 채운다
        sourceFile: fileName,
        sourceRow: raw.rowIndex,
      };
    }),
  );

  // 2차 방어선: (txKey, seq)가 이미 누적돼 있으면 skipDuplicates가 조용히 건너뛴다.
  await prisma.transaction.createMany({
    data: prepared.map((p) => ({
      txKey: p.txKey,
      seq: p.seq,
      kind: p.kind,
      side: p.side,
      date: p.date,
      month: p.month,
      place: p.place,
      amount: p.amount,
      proj: p.proj,
      use: p.use,
      content: p.content,
      evidence: p.evidence,
      payer: p.payer,
      settleDate: p.settleDate,
      settleMethod: p.settleMethod,
      noteRaw: p.noteRaw,
      memo: p.memo,
      sourceFile: p.sourceFile,
      sourceRow: p.sourceRow,
      fileHash,
    })),
    skipDuplicates: true,
  });

  // 이번 파일에서 실제로 새로 들어간 행만 fileHash로 구분해 classify를 돌린다
  // (스킵된 행은 원래 파일의 fileHash를 그대로 갖고 있어 여기 걸리지 않는다).
  const insertedRows = await prisma.transaction.findMany({
    where: { fileHash },
    orderBy: { sourceRow: "asc" },
  });

  // place_keyword는 부분일치라, "커피"보다 "컴포즈커피"가 먼저 매칭되게
  // pattern 길이 내림차순으로 정렬해서 넘긴다(classify.ts의 rules.find()는 첫 매칭에서 멈춤).
  const rules = (await prisma.adminCategoryRule.findMany()).sort(
    (a, b) => b.pattern.length - a.pattern.length,
  );
  if (insertedRows.length > 0) {
    await prisma.reviewDecision.createMany({
      data: insertedRows.map((tx) => {
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
        return {
          transactionId: tx.id,
          problemType: result.problemType,
          suggestion: result.suggestion,
          suggestedCategory: result.suggestedCategory,
          status: result.status,
          resolvedCategory:
            result.status === "auto_confirmed" ? result.suggestedCategory : null,
          decidedAt: result.status === "auto_confirmed" ? new Date() : null,
        };
      }),
      skipDuplicates: true,
    });
  }

  const txAdded = insertedRows.length;
  const txSkippedDuplicate = prepared.length - txAdded;
  const txTotal = await prisma.transaction.count();

  await prisma.processedFile.create({
    data: {
      fileHash,
      fileName,
      sizeBytes: buffer.length,
      kind,
      sheet: parsed.sheet,
      headerRow: parsed.headerRow,
      dataStartRow: parsed.dataStartRow,
      rowCount: prepared.length,
      processedAt: new Date(),
      txAdded,
      txSkippedDuplicate,
      status: "processed",
      anomalies: [],
    },
  });

  return {
    fileName,
    fileHash,
    kind,
    status: "processed",
    rowCount: prepared.length,
    txAdded,
    txSkippedDuplicate,
    txTotal,
    anomalies: [],
  };
}

// 마스터 파일 처리 결과를 ProcessedFile에 upsert로 기록한다(create가 아님) — 파일 해시가
//같아도(재업로드) 새 행을 만들지 않고 갱신한다. Transaction은 만들지 않는다.
async function ingestMasterKind(
  fileName: string,
  buffer: Buffer,
  kind: "마스터-프로젝트" | "마스터-대출" | "마스터-자산",
  fileHash: string,
): Promise<IngestSummary> {
  const result =
    kind === "마스터-프로젝트"
      ? await ingestProjectMaster(fileName, buffer)
      : kind === "마스터-대출"
        ? await ingestLoanMaster(fileName, buffer)
        : await ingestAssetMaster(fileName, buffer);

  const data = {
    fileName,
    sizeBytes: buffer.length,
    kind,
    rowCount: result.rowCount,
    processedAt: new Date(),
    txAdded: result.upserted,
    txSkippedDuplicate: 0,
    status: result.status,
    anomalies: result.anomalies,
  };
  await prisma.processedFile.upsert({
    where: { fileHash },
    update: data,
    create: { fileHash, ...data },
  });

  return {
    fileName,
    fileHash,
    kind,
    status: result.status,
    rowCount: result.rowCount,
    txAdded: result.upserted,
    txSkippedDuplicate: 0,
    txTotal: await prisma.transaction.count(),
    anomalies: result.anomalies,
  };
}
