// state-schema.md §2/§3 기준 타입 정의.

export type Kind =
  | "매출-세금계산서"
  | "매입-세금계산서"
  | "매입-간이영수증"
  | "매입-국세지방세"
  | "인건비-급여대장"
  | "인건비-4대보험"
  | "마스터-프로젝트"
  | "마스터-대출"
  | "마스터-자산";

// 기존 4종 ERP 파일 전용. columnMap.ts의 KIND_COLUMNS가 이 타입만 커버한다
// (급여대장/4대보험/마스터 3종은 열 구성이 달라 별도 파서를 쓴다).
export type ErpKind =
  | "매출-세금계산서"
  | "매입-세금계산서"
  | "매입-간이영수증"
  | "매입-국세지방세";

export type MasterKind = "마스터-프로젝트" | "마스터-대출" | "마스터-자산";

export type Side = "매출" | "매입" | "인건비";

export function sideOf(kind: Kind): Side {
  if (kind.startsWith("매출")) return "매출";
  if (kind.startsWith("인건비")) return "인건비";
  return "매입";
}

export function isMasterKind(kind: Kind): kind is MasterKind {
  return kind.startsWith("마스터-");
}

export function isLaborKind(kind: Kind): kind is "인건비-급여대장" | "인건비-4대보험" {
  return kind.startsWith("인건비-");
}

// 파싱 직후, 정규화 전 원문 그대로의 값(셀 원본 타입 보존: string | number | Date | undefined)
export interface RawRow {
  rowIndex: number; // 0-based, 시트 원본 행 번호
  date: unknown;
  place: unknown;
  amount: unknown;
  evidence: unknown;
  payer: unknown;
  use: unknown;
  content: unknown;
  proj: unknown;
  note: unknown;
  memo: unknown;
}

// normalize() 이후, txKey 계산 전 상태
export interface NormalizedRow {
  rowIndex: number;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  place: string;
  amount: number | null;
  evidence: string;
  payer: string | null;
  use: string;
  content: string;
  proj: string;
  settleDate: string | null;
  settleMethod: string | null;
  noteRaw: string | null;
  memo: string;
}

// seq 배정 + txKey 계산까지 끝난, DB에 넣을 수 있는 최종 형태
export interface PreparedTransaction extends NormalizedRow {
  kind: Kind;
  side: Side;
  txKey: string;
  seq: number;
  sourceFile: string;
  sourceRow: number;
}

export interface Anomaly {
  type: string;
  message: string;
}
