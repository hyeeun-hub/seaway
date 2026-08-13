import { won, monthLabel } from "@/lib/format";
import type { MonthlyPnlRow, ProjectPnlRow } from "@/lib/aggregate";

// 요약 문구 템플릿. /reports의 "템플릿 다시 생성" 버튼과 초기 로드 모두 이 함수를 쓴다.
export function generateSummaryText(
  selectedMonth: string,
  monthlyRows: MonthlyPnlRow[],
  projectRows: ProjectPnlRow[],
): string {
  const months = monthlyRows.map((m) => m.month);
  const idx = months.indexOf(selectedMonth);
  const current = monthlyRows[idx];
  const prev = monthlyRows[idx - 1];
  if (!current) return "";

  const rankByRevenue =
    [...monthlyRows].sort((a, b) => b.revenue - a.revenue).findIndex((m) => m.month === selectedMonth) + 1;

  const topProject = [...projectRows].sort((a, b) => b.revenue - a.revenue)[0];
  const shareOfTop =
    topProject && current.revenue > 0 ? (topProject.revenue / current.revenue) * 100 : null;

  const turnedProfitable = prev && prev.profit < 0 && current.profit >= 0;
  const turnedLoss = prev && prev.profit >= 0 && current.profit < 0;

  const lossProjects = projectRows.filter((p) => p.profit < 0);

  return [
    `${monthLabel(selectedMonth)} 총 매출은 ${won(current.revenue)}, 총 매입은 ${won(current.cost)}으로 순이익 ${won(current.profit)}을 기록했습니다.`,
    `${months.length}개월 중 매출 ${rankByRevenue}위.`,
    turnedProfitable ? "전월 적자에서 흑자로 전환." : turnedLoss ? "전월 흑자에서 적자로 전환." : null,
    topProject && shareOfTop !== null
      ? `손익 기여가 가장 큰 프로젝트는 ${topProject.proj}(${won(topProject.profit)})이며,`
      : null,
    lossProjects.length > 0
      ? `${lossProjects.map((p) => p.proj).join("·")} ${lossProjects.length}건이 적자로 원가 검토가 필요합니다.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}
