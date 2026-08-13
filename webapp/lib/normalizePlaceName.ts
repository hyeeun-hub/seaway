// 검수 확정 시 place_keyword 규칙 pattern으로 쓸 상호명을 원문에서 뽑아낸다.
// 예: "한라식당 제주노형점_한라식당(간편결제)_2" → "한라식당"
export function normalizePlacePattern(place: string): string {
  let s = place.split("_")[0].trim();
  s = s.replace(/\(주\)|주식회사/g, "").trim();

  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens[tokens.length - 1].endsWith("점")) {
    tokens.pop();
  }
  return tokens.join(" ").trim();
}
