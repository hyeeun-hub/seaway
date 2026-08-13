import type { ErpKind } from "./types";

// state-schema.md §3. kind별로 다른 열 이름만 여기 정의하고, 공통 열은 COMMON_COLUMNS로 뺀다.
interface KindColumns {
  date: string;
  place: string;
  amount: string;
  evidence: string | null;
  payer: string | null;
}

export const KIND_COLUMNS: Record<ErpKind, KindColumns> = {
  "매출-세금계산서": {
    date: "작성일자",
    place: "공급받는자상호",
    amount: "합계금액",
    evidence: "증빙",
    payer: null,
  },
  "매입-세금계산서": {
    date: "작성일자",
    place: "공급자상호",
    amount: "합계금액",
    evidence: "증빙",
    payer: null,
  },
  "매입-간이영수증": {
    date: "사용일시",
    place: "사용처",
    amount: "사용금액",
    evidence: null,
    payer: "사용자",
  },
  "매입-국세지방세": {
    date: "과세월일",
    place: "세목명",
    amount: "총납부세액",
    evidence: "증빙",
    payer: null,
  },
};

// 4종 파일 모두 동일한 열 이름을 쓴다(§3).
export const COMMON_COLUMNS = {
  use: "용도",
  content: "내용",
  proj: "프로젝트/현장",
  note: "비고",
  memo: "메모",
};

export function requiredColumns(kind: ErpKind): string[] {
  const k = KIND_COLUMNS[kind];
  return [
    k.date,
    k.place,
    k.amount,
    COMMON_COLUMNS.use,
    COMMON_COLUMNS.content,
    COMMON_COLUMNS.proj,
    COMMON_COLUMNS.note,
    COMMON_COLUMNS.memo,
  ];
}
