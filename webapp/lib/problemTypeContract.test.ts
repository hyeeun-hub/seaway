import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTransaction, SMALL_AMOUNT_THRESHOLD } from "./classify";
import { PROBLEM_TYPE } from "./problemTypes";
import type { ClassifyInput } from "./classify";

// classify.ts가 실제로 만들 수 있는 problemType 값의 집합이 lib/problemTypes.ts에 선언된
// 8개 값과 정확히 같은지 검증한다.
//
// lib/verify.ts/aggregate.ts/calendar.ts 쪽 소비자는 이제 전부 PROBLEM_TYPE.* 심볼을
// 참조하므로, 존재하지 않는 값을 검사하려는 시도는 이미 tsc 단계에서 막힌다(작업 1의
// 성공 조건). 이 테스트는 그 반대 방향 — classify.ts가 PROBLEM_TYPE에 없는 새 문자열을
// "몰래" 리턴하기 시작하는 회귀 — 를 런타임으로 지킨다. 문자열이 DB(ReviewDecision)를
// 거쳐 reclassify/review API 경로로 흘러오므로, 타입만으로는 이 방향을 완전히 막을 수 없다.

function input(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    kind: "매입-세금계산서",
    proj: "",
    use: "",
    content: "",
    place: "",
    amount: 100_000,
    noteRaw: null,
    settleDate: null,
    memo: "",
    ...overrides,
  };
}

// classify.ts의 13개 return문 각각을 한 번씩 실행하는 대표 입력 — lib/classify.test.ts의
// 분기별 골든 케이스와 같은 근거를 쓴다(이 파일은 "값 집합이 맞는가"만 본다).
const GOLDEN_CASES: { tx: ClassifyInput; rules: Parameters<typeof classifyTransaction>[1] }[] = [
  { tx: input({ amount: null }), rules: [] },
  { tx: input({ kind: "인건비-급여대장" }), rules: [] },
  {
    tx: input({ proj: "x", memo: "대납 확인" }),
    rules: [{ matchOn: "memo_keyword", pattern: "대납", category: "" }],
  },
  { tx: input({ kind: "매입-국세지방세", proj: "" }), rules: [] },
  {
    tx: input({ proj: "차내윤" }),
    rules: [{ matchOn: "flag_review", pattern: "차내윤", category: "" }],
  },
  {
    tx: input({ proj: "사무실운영" }),
    rules: [{ matchOn: "proj", pattern: "사무실운영", category: "복리후생비" }],
  },
  { tx: input({ kind: "매입-간이영수증", proj: "현장", place: "미매칭사용처" }), rules: [] },
  {
    tx: input({ kind: "매입-간이영수증", proj: "", place: "기술보증기금", amount: 500_000 }),
    rules: [{ matchOn: "place_keyword", pattern: "기술보증기금", category: "지급수수료" }],
  },
  { tx: input({ kind: "매입-간이영수증", proj: "", amount: SMALL_AMOUNT_THRESHOLD - 1 }), rules: [] },
  { tx: input({ kind: "매입-간이영수증", proj: "", amount: SMALL_AMOUNT_THRESHOLD }), rules: [] },
  { tx: input({ kind: "매입-세금계산서", proj: "", use: "매입", content: "자재비" }), rules: [] },
  { tx: input({ proj: "현장", noteRaw: "형식불명", settleDate: null }), rules: [] },
  { tx: input({ proj: "현장" }), rules: [] },
];

test("classifyTransaction의 결과 집합은 PROBLEM_TYPE에 선언된 8개 값과 정확히 같다", () => {
  const produced = new Set(GOLDEN_CASES.map(({ tx, rules }) => classifyTransaction(tx, rules).problemType));
  const known = new Set(Object.values(PROBLEM_TYPE));

  assert.deepEqual(
    [...produced].sort(),
    [...known].sort(),
    "classify.ts가 만드는 값과 PROBLEM_TYPE에 선언된 값이 어긋난다 — 새 값이 추가됐거나, " +
      "골든 케이스가 8개를 전부 커버하지 못하고 있다",
  );
});
