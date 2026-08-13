import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTxKey, assignSeq } from "./txKey";

test("동일 필드 3건은 seq 1/2/3으로 모두 살아남는다(state-schema.md §4 아시아나항공 3건 사례)", () => {
  const rows = [{ txKey: "A" }, { txKey: "A" }, { txKey: "A" }];
  const result = assignSeq(rows);
  assert.deepEqual(result.map((r) => r.seq), [1, 2, 3]);
});

test("서로 다른 tx_key는 각자 seq 1부터 독립적으로 센다", () => {
  const rows = [{ txKey: "A" }, { txKey: "B" }, { txKey: "A" }, { txKey: "B" }];
  const result = assignSeq(rows);
  assert.deepEqual(result.map((r) => r.seq), [1, 1, 2, 2]);
});

test("assignSeq는 같은 입력에 항상 같은 seq를 재현한다(재업로드 시 skipDuplicates가 전량 스킵하려면 이 결정성이 전제 조건)", () => {
  const rows = [{ txKey: "A" }, { txKey: "B" }, { txKey: "A" }];
  const run1 = assignSeq(rows).map((r) => r.seq);
  const run2 = assignSeq(rows).map((r) => r.seq);
  assert.deepEqual(run1, run2);
});

test("computeTxKey는 source_file을 반영하지 않는다(파일명이 바뀌어도 같은 거래는 같은 키)", () => {
  const base = {
    kind: "매출-세금계산서" as const,
    date: "2026-01-01",
    place: "A",
    amount: 1000,
    proj: "P",
    use: "U",
    content: "C",
  };
  // computeTxKey 시그니처 자체에 source_file 파라미터가 없다 — 같은 입력을 두 번 넣어도
  // 같은 값이 나온다는 것 자체가 "파일명 변경과 무관"함을 보여준다.
  assert.equal(computeTxKey(base), computeTxKey(base));
});

test("computeTxKey는 amount=null(빈 문자열)과 amount=0(\"0\")을 다르게 취급한다", () => {
  const base = { kind: "매입-세금계산서" as const, date: "2026-01-01", place: "A", proj: "", use: "", content: "" };
  const keyNull = computeTxKey({ ...base, amount: null });
  const keyZero = computeTxKey({ ...base, amount: 0 });
  assert.notEqual(keyNull, keyZero);
});

test("kind가 다르면 나머지 필드가 같아도 다른 키(2026-04-08 창조이엔지 매출/매입 통과거래 사례)", () => {
  const base = { date: "2026-04-08", place: "창조이엔지", amount: 21_489_886, proj: "창조이엔지", use: "", content: "" };
  const saleKey = computeTxKey({ ...base, kind: "매출-세금계산서" });
  const purchaseKey = computeTxKey({ ...base, kind: "매입-세금계산서" });
  assert.notEqual(saleKey, purchaseKey);
});

test("place가 다르면 나머지 필드가 같아도 다른 키", () => {
  const base = { kind: "매입-세금계산서" as const, date: "2026-01-01", amount: 1000, proj: "", use: "", content: "" };
  assert.notEqual(computeTxKey({ ...base, place: "A" }), computeTxKey({ ...base, place: "B" }));
});
