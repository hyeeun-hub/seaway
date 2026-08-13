import { createHash } from "node:crypto";
import type { Kind } from "./types";

// state-schema.md §4 기준.
// tx_key = sha256(kind|date|place|amount|proj|use|content) 공식을 그대로 구현한다.
// source_file은 키에 넣지 않는다. amount는 정수를 10진 문자열로, 빈 값은 빈 문자열로 넣는다.
export function computeTxKey(input: {
  kind: Kind;
  date: string;
  place: string;
  amount: number | null;
  proj: string;
  use: string;
  content: string;
}): string {
  const amountStr = input.amount === null ? "" : String(input.amount);
  const raw = [
    input.kind,
    input.date,
    input.place,
    amountStr,
    input.proj,
    input.use,
    input.content,
  ].join("|");
  return "sha256:" + createHash("sha256").update(raw, "utf8").digest("hex");
}

// state-schema.md §4 "seq — 왜 필요한가".
// 같은 파일 안에서 같은 tx_key가 나타난 순번(원본 행 순서 기준, 1부터)을 부여한다.
export function assignSeq<T extends { txKey: string }>(
  rowsInFileOrder: T[],
): (T & { seq: number })[] {
  const counters = new Map<string, number>();
  return rowsInFileOrder.map((row) => {
    const next = (counters.get(row.txKey) ?? 0) + 1;
    counters.set(row.txKey, next);
    return { ...row, seq: next };
  });
}
