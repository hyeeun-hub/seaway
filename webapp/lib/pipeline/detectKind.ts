import type { Kind } from "./types";

// state-schema.md §3 매핑표. 추측하지 않는다 — 여기 없는 패턴은 null(접수 거부).
export function detectKind(fileName: string): Kind | null {
  const name = fileName.normalize("NFC");

  if (name.startsWith("매출") && name.includes("세금계산서")) {
    return "매출-세금계산서";
  }
  if (name.startsWith("매입") && name.includes("세금계산서")) {
    return "매입-세금계산서";
  }
  if (name.startsWith("매입") && name.includes("간이영수증")) {
    return "매입-간이영수증";
  }
  if (
    name.startsWith("매입") &&
    name.includes("국세") &&
    name.includes("지방세")
  ) {
    return "매입-국세지방세";
  }
  if (name.startsWith("급여대장")) {
    return "인건비-급여대장";
  }
  if (name.startsWith("4대보험")) {
    return "인건비-4대보험";
  }
  if (name.startsWith("프로젝트마스터")) {
    return "마스터-프로젝트";
  }
  if (name.startsWith("대출마스터")) {
    return "마스터-대출";
  }
  if (name.startsWith("자산마스터")) {
    return "마스터-자산";
  }
  return null;
}
