export function won(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("ko-KR")}원`;
}

export function signedWon(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${won(n)}`;
}

// "1.3억", "5,580만"처럼 카드/리스트에 짧게 넣을 때 쓴다.
export function shortWon(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e4).toLocaleString()}만`;
  return won(n);
}

export function monthLabel(month: string): string {
  if (month === "all") return "전체 기간";
  return `${month.slice(0, 4)}년 ${month.slice(5, 7)}월`;
}
