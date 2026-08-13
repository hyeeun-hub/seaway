import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTransaction, SMALL_AMOUNT_THRESHOLD } from "./classify";
import { PROBLEM_TYPE } from "./problemTypes";
import type { ClassifyInput } from "./classify";

function baseInput(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
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

test("금액 공백 → 금액 누락(needs_review), 0으로 채우지 않는다", () => {
  const r = classifyTransaction(baseInput({ amount: null }), []);
  assert.equal(r.problemType, PROBLEM_TYPE.AMOUNT_MISSING);
  assert.equal(r.status, "needs_review");
});

test("급여대장/4대보험 → 인건비 자동확정(다른 필드와 무관)", () => {
  const r = classifyTransaction(baseInput({ kind: "인건비-급여대장", proj: "" }), []);
  assert.equal(r.problemType, PROBLEM_TYPE.LABOR);
  assert.equal(r.status, "auto_confirmed");
});

test("메모가 위험 키워드에 걸리면 메모 확인 필요(다른 분기보다 먼저 검사)", () => {
  const rules = [{ matchOn: "memo_keyword", pattern: "대납", category: "" }];
  const r = classifyTransaction(baseInput({ proj: "아무현장", memo: "타사 대납분 포함" }), rules);
  assert.equal(r.problemType, PROBLEM_TYPE.MEMO_NEEDS_REVIEW);
  assert.equal(r.status, "needs_review");
});

test("메모가 있어도 위험 키워드가 아니면 일반 분류 로직을 계속 탄다", () => {
  const rules = [{ matchOn: "memo_keyword", pattern: "대납", category: "" }];
  const r = classifyTransaction(baseInput({ proj: "아무현장", memo: "품목: 볼트 10개" }), rules);
  assert.notEqual(r.problemType, PROBLEM_TYPE.MEMO_NEEDS_REVIEW);
});

test("국세지방세 + proj 공백 → 세금과공과로 일반관리비 자동확정", () => {
  const r = classifyTransaction(baseInput({ kind: "매입-국세지방세", proj: "" }), []);
  assert.equal(r.problemType, PROBLEM_TYPE.GENERAL_ADMIN);
  assert.equal(r.suggestedCategory, "세금과공과");
  assert.equal(r.status, "auto_confirmed");
});

test("flag_review 등록값과 proj 일치 → 미매칭(확인 필요 항목)", () => {
  const rules = [{ matchOn: "flag_review", pattern: "차내윤", category: "" }];
  const r = classifyTransaction(baseInput({ proj: "차내윤" }), rules);
  assert.equal(r.problemType, PROBLEM_TYPE.UNMATCHED_FLAGGED);
  assert.equal(r.status, "needs_review");
});

test("사전 등록 proj 정확히 일치 → 일반관리비 자동확정(등록된 카테고리 그대로)", () => {
  const rules = [{ matchOn: "proj", pattern: "사무실운영", category: "복리후생비" }];
  const r = classifyTransaction(baseInput({ proj: "사무실운영" }), rules);
  assert.equal(r.problemType, PROBLEM_TYPE.GENERAL_ADMIN);
  assert.equal(r.suggestedCategory, "복리후생비");
  assert.equal(r.status, "auto_confirmed");
});

// 회귀 방지: classify.ts:134-138 주석에 남은 실제 사고 사례(도두항 현장의 네이버파이낸셜/
// 한국중소벤처기업유통원 지급수수료 건)와 같은 모양이다. 현장이 지정돼 있으면 계정과목을
// 몰라도 그 현장 비용으로 남아야 한다 — problemType이 "일반관리비"로 나오면
// isGeneralAdmin()이 이 거래를 프로젝트별 손익에서 빼버려 현장 원가가 조용히 새어나간다.
test("간이영수증 + use/content 공백 + 현장 지정됨 → 정상(일반관리비로 새면 안 됨)", () => {
  const r = classifyTransaction(
    baseInput({ kind: "매입-간이영수증", proj: "2026도두항부잔교설치공사", place: "미매칭사용처" }),
    [],
  );
  assert.equal(r.problemType, PROBLEM_TYPE.NORMAL);
  assert.notEqual(r.problemType, PROBLEM_TYPE.GENERAL_ADMIN);
  assert.equal(r.suggestedCategory, "미분류");
});

test("간이영수증 + use/content 공백 + 현장 지정 + 사용처 키워드 매칭 → 정상, 매칭된 카테고리", () => {
  const rules = [{ matchOn: "place_keyword", pattern: "네이버파이낸셜", category: "지급수수료" }];
  const r = classifyTransaction(
    baseInput({ kind: "매입-간이영수증", proj: "2026도두항부잔교설치공사", place: "네이버파이낸셜" }),
    rules,
  );
  assert.equal(r.problemType, PROBLEM_TYPE.NORMAL);
  assert.equal(r.suggestedCategory, "지급수수료");
});

test("간이영수증 + proj 공백 + 현장귀속불필요 카테고리(세금과공과·지급수수료) 매칭 → 일반관리비 자동확정", () => {
  const rules = [{ matchOn: "place_keyword", pattern: "기술보증기금", category: "지급수수료" }];
  const r = classifyTransaction(
    baseInput({ kind: "매입-간이영수증", proj: "", place: "기술보증기금", amount: 500_000 }),
    rules,
  );
  assert.equal(r.problemType, PROBLEM_TYPE.GENERAL_ADMIN);
  assert.equal(r.suggestedCategory, "지급수수료");
  assert.equal(r.status, "auto_confirmed");
});

test(`간이영수증 + proj 공백 + 소액(${SMALL_AMOUNT_THRESHOLD}원 미만) → 미분류 일반관리비 자동확정`, () => {
  const r = classifyTransaction(
    baseInput({ kind: "매입-간이영수증", proj: "", amount: SMALL_AMOUNT_THRESHOLD - 1 }),
    [],
  );
  assert.equal(r.problemType, PROBLEM_TYPE.GENERAL_ADMIN);
  assert.equal(r.suggestedCategory, "미분류 일반관리비");
});

test(`간이영수증 + proj 공백 + 고액(${SMALL_AMOUNT_THRESHOLD}원 이상) + 미매칭 → 미매칭(공백), 사람 확인 필요`, () => {
  const r = classifyTransaction(
    baseInput({ kind: "매입-간이영수증", proj: "", amount: SMALL_AMOUNT_THRESHOLD }),
    [],
  );
  assert.equal(r.problemType, PROBLEM_TYPE.UNMATCHED_BLANK);
  assert.equal(r.status, "needs_review");
});

test("간이영수증이 아니면서 proj 공백 → 미매칭(공백)", () => {
  const r = classifyTransaction(
    baseInput({ kind: "매입-세금계산서", proj: "", use: "매입", content: "자재비" }),
    [],
  );
  assert.equal(r.problemType, PROBLEM_TYPE.UNMATCHED_BLANK);
  assert.equal(r.status, "needs_review");
});

test("비고 원문이 있는데 파싱 실패(settle_date=null) → 예정일 확인 필요", () => {
  const r = classifyTransaction(baseInput({ proj: "아무현장", noteRaw: "형식불명 텍스트", settleDate: null }), []);
  assert.equal(r.problemType, PROBLEM_TYPE.SETTLE_DATE_UNPARSED);
  assert.equal(r.status, "needs_review");
});

test("proj 있음 + 특이사항 없음 → 정상 자동확정", () => {
  const r = classifyTransaction(baseInput({ proj: "아무현장" }), []);
  assert.equal(r.problemType, PROBLEM_TYPE.NORMAL);
  assert.equal(r.status, "auto_confirmed");
});
