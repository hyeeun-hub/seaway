import { normalizePlacePattern } from "./normalizePlaceName";

// 프로젝트/현장이 공백인 검수 건에서 "이 거래, 어느 현장 것 같아?"를 힌트로 제안한다.
// 값 비교만으로 판단한다(LLM 없음) — 힌트가 틀릴 수 있다는 전제로, 근거 건수를 항상 함께 낸다.
// 절대 자동 반영하지 않는다. 사용자가 버튼을 눌러야 Transaction.proj가 실제로 바뀐다.

export interface HintCandidate {
  proj: string;
  count: number;
}

export interface ReviewHint {
  basis: "place" | "industry";
  keyword?: string; // "industry" 근거일 때 매칭된 업종 키워드
  candidates: HintCandidate[]; // 1~2개. 비등하면(차이 1 이하) 둘 다 담는다.
}

interface HintPoolRow {
  place: string;
  proj: string;
  date: string; // YYYY-MM-DD
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;
}

// 1위와 근소한(차이 1건 이하) 2위가 있으면 둘 다 반환해 자동 선택을 피한다.
function topCandidates(counts: Map<string, number>): HintCandidate[] {
  const sorted = [...counts.entries()]
    .map(([proj, count]) => ({ proj, count }))
    .sort((a, b) => b.count - a.count);
  if (sorted.length === 0) return [];
  const result = [sorted[0]];
  if (sorted[1] && sorted[1].count >= sorted[0].count - 1) result.push(sorted[1]);
  return result;
}

export function findReviewHint(
  target: { place: string; date: string },
  pool: HintPoolRow[],
  placeKeywordRules: { pattern: string }[],
): ReviewHint | null {
  // 1순위: 같은 사용처(정규화 후 일치) + proj 지정된 거래.
  const targetNorm = normalizePlacePattern(target.place);
  const sameNameCounts = new Map<string, number>();
  for (const c of pool) {
    if (normalizePlacePattern(c.place) === targetNorm) {
      sameNameCounts.set(c.proj, (sameNameCounts.get(c.proj) ?? 0) + 1);
    }
  }
  if (sameNameCounts.size > 0) {
    return { basis: "place", candidates: topCandidates(sameNameCounts) };
  }

  // 2순위: 같은 업종 키워드(가장 구체적으로 매칭되는 place_keyword pattern) + ±14일 + proj 지정.
  const sortedRules = [...placeKeywordRules].sort((a, b) => b.pattern.length - a.pattern.length);
  const matchedRule = sortedRules.find((r) => target.place.includes(r.pattern));
  if (!matchedRule) return null;

  const industryCounts = new Map<string, number>();
  for (const c of pool) {
    if (!c.place.includes(matchedRule.pattern)) continue;
    if (daysBetween(c.date, target.date) > 14) continue;
    industryCounts.set(c.proj, (industryCounts.get(c.proj) ?? 0) + 1);
  }
  if (industryCounts.size === 0) return null;
  return { basis: "industry", keyword: matchedRule.pattern, candidates: topCandidates(industryCounts) };
}
