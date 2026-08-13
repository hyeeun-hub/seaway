import type { AdminCategoryRule } from "@/generated/prisma/client";
import { PROBLEM_TYPE, type ProblemType } from "@/lib/problemTypes";

// classify-skill의 "자동 처리 허용 조건" 3원칙(값 비교만, 재실행해도 동일 결과, 오판정 시
// verify가 잡을 수 있음)을 만족하는 것만 auto_confirmed로 둔다. "사람 이름처럼 보인다" 같은
// 문맥 추론은 규칙화하지 않는다 — 대신 사람이 한 번 알아본 값을 AdminCategoryRule(flag_review)에
// 등록해두면, 그 다음부터는 "값이 목록에 있는가"라는 값 비교 규칙으로 재현 가능하게 다룬다.

// "현장도 모르는" 간이영수증 중, 이 금액 미만은 손익 영향이 작다고 보고
// "미분류 일반관리비"로 자동 집계한다. 5만원보다 크게 잡지 않는다(손익 왜곡 위험).
// 주의: 이 임계값은 proj(프로젝트/현장)가 공백인 경우에만 적용된다. 현장이 이미 지정된
// 건은 계정과목(사용처 키워드)을 몰라도 그 현장 비용으로 계상한다 — "계정과목을 모른다"와
// "현장을 모른다"는 다른 문제이고, 금액 임계값은 후자에만 쓰는 값이다.
export const SMALL_AMOUNT_THRESHOLD = 50_000;

// 이 카테고리들은 개별 공사/현장에 귀속시킬 수 없는 성격(회사 단위 세금·수수료 등)이라,
// place_keyword가 매칭되면 프로젝트/현장이 비어 있어도 자동 확정한다.
export const PROJECT_AGNOSTIC_CATEGORIES = ["세금과공과", "지급수수료"];

// 메모가 있다는 사실 자체는 검수 사유가 아니다(품목 설명, 지급 일정 같은 참고성 메모가
// 대부분). 손익 금액 자체를 왜곡할 수 있는(중복 계상, 타사 대납 등) 위험 신호가 있을 때만
// 검수로 보낸다. 위험 키워드는 하드코딩하지 않고 AdminCategoryRule(matchOn: "memo_keyword")에서
// 읽는다 — /memo 화면에서 사람이 새 표현을 등록하면 다음 분류부터 바로 반영되게 하기 위함.

export type ClassifyStatus = "auto_confirmed" | "needs_review";

export interface ClassifyInput {
  kind: string;
  proj: string;
  use: string;
  content: string;
  place: string;
  amount: number | null;
  noteRaw: string | null;
  settleDate: string | null;
  memo: string;
}

export interface ClassifyResult {
  status: ClassifyStatus;
  problemType: ProblemType;
  suggestedCategory: string | null;
  suggestion: string | null;
}

export function classifyTransaction(
  tx: ClassifyInput,
  rules: Pick<AdminCategoryRule, "matchOn" | "pattern" | "category">[],
): ClassifyResult {
  if (tx.amount === null) {
    return {
      status: "needs_review",
      problemType: PROBLEM_TYPE.AMOUNT_MISSING,
      suggestedCategory: null,
      suggestion: "원본 금액 셀이 비어 있음. 0으로 채우지 않고 원본 확인 필요",
    };
  }

  // 급여대장/4대보험은 검수 대상이 아니다 — proj가 항상 공백이라 아래 로직을 그대로
  // 타면 전부 "미매칭(공백)"으로 검수에 쌓인다. 인건비는 매출-매입 손익 계산에서
  // 제외되고(aggregate.ts) 별도 파생원가 계산(1-b)에 쓰이므로 여기서 바로 확정한다.
  if (tx.kind === "인건비-급여대장" || tx.kind === "인건비-4대보험") {
    return {
      status: "auto_confirmed",
      problemType: PROBLEM_TYPE.LABOR,
      suggestedCategory: "인건비",
      suggestion: "급여대장/4대보험 데이터. 손익(매출-매입) 계산에서 제외되며 별도 인건비 파생원가 계산에 쓰입니다",
    };
  }

  // 메모 중 손익 금액 자체에 영향을 줄 수 있는 위험 신호(중복 계상, 타사 대납 등)만
  // 검수로 보낸다. 나머지 메모(품목 설명, 지급 일정)는 자동 분류하고 화면에 표시만 한다.
  // 그래서 금액 누락 다음, 나머지 모든 분기보다 먼저 검사한다.
  if (tx.memo !== "") {
    const hit = rules.find((r) => r.matchOn === "memo_keyword" && tx.memo.includes(r.pattern));
    if (hit) {
      return {
        status: "needs_review",
        problemType: PROBLEM_TYPE.MEMO_NEEDS_REVIEW,
        suggestedCategory: null,
        suggestion: `원본 메모: "${tx.memo}" — "${hit.pattern}" 포함. 중복 계상 또는 타사 대납 가능성이 있어 손익 반영 전 확인 필요`,
      };
    }
    // 위험 키워드가 없으면 여기서 끝내지 않고 아래 일반 분류 로직을 계속 탄다.
  }

  // 국세/지방세 파일은 파일 종류 자체가 회사 공통 세금·공과금이라는 뜻이다(state-schema.md §3).
  // proj가 비어 있어도 kind만으로 100% 결정되는 값 비교 규칙이라 자동 확정 3원칙을 만족한다.
  if (tx.kind === "매입-국세지방세" && tx.proj === "") {
    return {
      status: "auto_confirmed",
      problemType: PROBLEM_TYPE.GENERAL_ADMIN,
      // 일반기업회계기준상 표준 명칭인 "세금과공과"로 통일한다(place_keyword 경로로
      // 들어오는 "지방세입금" 건과 계정명을 맞춘다 — 원래는 "세금/공과금"이었음).
      suggestedCategory: "세금과공과",
      suggestion: "매입-국세지방세 파일 항목은 프로젝트 무관 공통 세금과공과로 자동 분류",
    };
  }

  // proj가 비어 있어도 등록된 값(사람 이름 등 확인 필요 항목·일반관리비 proj)과 정확히
  // 일치하는 경우는 없으므로, 아래 두 체크는 proj 공백/비공백과 무관하게 먼저 해도 안전하다.
  const flagged = rules.find(
    (r) => r.matchOn === "flag_review" && r.pattern === tx.proj,
  );
  if (flagged) {
    return {
      status: "needs_review",
      problemType: PROBLEM_TYPE.UNMATCHED_FLAGGED,
      suggestedCategory: null,
      suggestion: `"${tx.proj}"는 이전에 확인이 필요하다고 등록된 값. 개인 경비면 제외, 현장이면 수정`,
    };
  }

  const adminMatch = rules.find(
    (r) => r.matchOn === "proj" && r.pattern === tx.proj,
  );
  if (adminMatch) {
    return {
      status: "auto_confirmed",
      problemType: PROBLEM_TYPE.GENERAL_ADMIN,
      suggestedCategory: adminMatch.category,
      suggestion: `사전 등록된 일반관리비 항목("${tx.proj}")과 정확히 일치`,
    };
  }

  const noteExistsButUnparsed = tx.noteRaw !== null && tx.settleDate === null;

  const isReceiptBlank =
    tx.kind === "매입-간이영수증" && tx.use === "" && tx.content === "";
  if (isReceiptBlank) {
    const keywordMatch = rules.find(
      (r) => r.matchOn === "place_keyword" && tx.place.includes(r.pattern),
    );

    // 현장이 이미 지정되어 있으면 계정과목 매칭 여부(지급수수료 등 현장귀속불필요
    // 카테고리 포함)와 무관하게 그 현장 비용으로 계상한다. problemType을 "일반관리비"로
    // 두면 안 된다 — aggregate.ts의 isGeneralAdmin()이 이 값으로 판정해 프로젝트별
    // 손익 집계에서 빼버리기 때문에, 현장이 있는 원가가 조용히 일반관리비로 새어나가게
    // 된다(예: 도두항 현장의 네이버파이낸셜/한국중소벤처기업유통원 지급수수료 건).
    if (tx.proj !== "") {
      return {
        status: "auto_confirmed",
        problemType: PROBLEM_TYPE.NORMAL,
        suggestedCategory: keywordMatch?.category ?? "미분류",
        suggestion: keywordMatch
          ? `사용처("${tx.place}")가 키워드 규칙("${keywordMatch.pattern}")에 매칭됨`
          : "현장은 지정되어 있으나 사용처 규칙 미매칭. 해당 현장 비용으로 계상하고 계정과목만 미분류로 둠",
      };
    }

    // 여기부터 proj === ""(현장 모름). 세금과공과/지급수수료처럼 현장 귀속이 필요
    // 없는 카테고리는 자동 확정한다(검수로 보내도 답은 "현장 없음"이므로).
    if (keywordMatch && PROJECT_AGNOSTIC_CATEGORIES.includes(keywordMatch.category)) {
      return {
        status: "auto_confirmed",
        problemType: PROBLEM_TYPE.GENERAL_ADMIN,
        suggestedCategory: keywordMatch.category,
        suggestion: `사용처("${tx.place}")가 "${keywordMatch.category}"로 매칭됨. 이 분류는 현장 귀속이 필요 없어 프로젝트/현장 공백이어도 자동 확정`,
      };
    }

    // 나머지도 proj === ""(현장도 모름). 금액이 작으면 손익 영향이 작다고 보고 자동
    // 집계하고, 크면 사람 확인이 필요하다.
    if (tx.amount < SMALL_AMOUNT_THRESHOLD) {
      return {
        status: "auto_confirmed",
        problemType: PROBLEM_TYPE.GENERAL_ADMIN,
        suggestedCategory: "미분류 일반관리비",
        suggestion: `현장 미지정 소액(${SMALL_AMOUNT_THRESHOLD.toLocaleString()}원 미만). 손익 영향이 작아 미분류 일반관리비로 자동 집계. 필요 시 재분류 가능`,
      };
    }

    return {
      status: "needs_review",
      problemType: PROBLEM_TYPE.UNMATCHED_BLANK,
      suggestedCategory: null,
      suggestion: "간이영수증 용도/내용이 공백이고 프로젝트/현장도 비어 있음. 현장 지정 후 확인 필요",
    };
  }

  if (tx.proj === "") {
    return {
      status: "needs_review",
      problemType: PROBLEM_TYPE.UNMATCHED_BLANK,
      suggestedCategory: null,
      suggestion: "프로젝트/현장 값이 비어 있음. 현장 지정 후 수정 필요",
    };
  }

  if (noteExistsButUnparsed) {
    return {
      status: "needs_review",
      problemType: PROBLEM_TYPE.SETTLE_DATE_UNPARSED,
      suggestedCategory: null,
      suggestion: `비고 원문("${tx.noteRaw}")이 "YYYY-MM-DD 수단" 형식이 아님`,
    };
  }

  return {
    status: "auto_confirmed",
    problemType: PROBLEM_TYPE.NORMAL,
    suggestedCategory: null,
    suggestion: null,
  };
}
