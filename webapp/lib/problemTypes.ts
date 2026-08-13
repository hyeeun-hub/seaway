// ReviewDecision.problemType의 유일한 값 사전. DB에 이미 이 정확한 한글 문자열로 저장된
// 레코드가 있으므로 값(문자열) 자체는 절대 바꾸지 않는다 — 이 모듈은 참조를 한 곳으로
// 모아 드리프트를 막는 용도다. Prisma enum으로 바꾸지 않는다(마이그레이션·기존 값 매핑
// 위험, TS 상수 + union 타입으로 충분하다).
//
// 생산자(이 값을 직접 대입하는 곳): lib/classify.ts, app/api/review/route.ts,
//   app/api/memo/route.ts
// 소비자(이 값을 비교해 손익 포함/제외·검사 통과/실패를 결정하는 곳): lib/aggregate.ts,
//   lib/verify.ts, lib/calendar.ts
//
// 새 값을 추가하거나 이 객체의 키를 바꾸면 위 생산자·소비자 전부가 같은 심볼을 참조하므로
// tsc가 누락을 잡아준다. app/review/page.tsx의 필터 목록은 problemType으로 동적
// groupBy하므로 하드코딩이 아니라 그대로 둔다.
export const PROBLEM_TYPE = {
  AMOUNT_MISSING: "금액 누락",
  LABOR: "인건비",
  MEMO_NEEDS_REVIEW: "메모 확인 필요",
  GENERAL_ADMIN: "일반관리비",
  UNMATCHED_FLAGGED: "미매칭(확인 필요 항목)",
  UNMATCHED_BLANK: "미매칭(공백)",
  SETTLE_DATE_UNPARSED: "예정일 확인 필요",
  NORMAL: "정상",
} as const;

export type ProblemType = (typeof PROBLEM_TYPE)[keyof typeof PROBLEM_TYPE];
