// 메모 원문에서 위험 키워드 등록 후보를 뽑는다. LLM을 쓰지 않는다 — 매번 다른 후보를
// 내면 재현성이 깨지고, 등록 여부는 어차피 사람이 최종 결정하므로 정교할 필요가 없다.
// 어절 단위로 자르고 흔한 조사를 떼어낸 뒤 2~4글자 한글 후보만 남기는 단순 규칙이다.
const PARTICLE_SUFFIXES = [
  "이나",
  "라도",
  "에게",
  "한테",
  "까지",
  "부터",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "의",
  "로",
  "과",
  "와",
  "도",
  "만",
  "나",
].sort((a, b) => b.length - a.length);

export function extractKeywordCandidates(memo: string): string[] {
  const tokens = memo.split(/\s+/).filter(Boolean);
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    let word = token.replace(/[.,!?"'()~·]/g, "");
    const suffix = PARTICLE_SUFFIXES.find((s) => word.length > s.length && word.endsWith(s));
    if (suffix) word = word.slice(0, -suffix.length);

    const len = [...word].length;
    if (len < 2 || len > 4) continue;
    if (!/^[가-힣]+$/.test(word)) continue;
    if (seen.has(word)) continue;

    seen.add(word);
    candidates.push(word);
  }

  return candidates;
}
