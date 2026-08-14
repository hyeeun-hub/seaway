"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { won } from "@/lib/format";

export interface RevenueRealProfitDatum {
  label: string;
  month: string; // "YYYY-MM" — 클릭 시 이동할 실제 월 값(label은 "01월" 같은 표시용이라 별도로 둔다)
  revenue: number; // 매출(항상 0 이상으로 취급) — 백만원 단위, 막대 높이용
  realProfit: number; // 진짜 손익(파생원가 반영, 흑자/적자 가능) — 백만원 단위, 막대 높이용
  revenueWon: number; // 정확한 원 단위 값 — 툴팁용
  realProfitWon: number;
}

const REVENUE = "#93c5fd"; // 매출 — 이 앱의 매출=파란색 관례
const PROFIT = { pos: "#2563eb", neg: "#dc2626" }; // 진짜 손익 흑자/적자

function valueLabel(props: unknown, anchorAbove: boolean, bold: boolean) {
  const { x, y, width, height, value } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    value: number;
  };
  if (!value) return <g />;
  return (
    <text
      x={x + width / 2}
      y={anchorAbove ? y - 6 : y + height + 13}
      textAnchor="middle"
      fontSize={11}
      fontWeight={bold ? 600 : 400}
      fill={bold ? (value < 0 ? PROFIT.neg : "#0f172a") : "#64748b"}
    >
      {value.toLocaleString()}
    </text>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: { revenueWon: number; realProfitWon: number } }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="text-slate-500">
        매출 <span className="font-medium text-slate-900">{won(d.revenueWon)}</span>
      </p>
      <p className={d.realProfitWon < 0 ? "text-red-600" : "text-blue-600"}>
        손익 <span className="font-medium">{won(d.realProfitWon)}</span>
      </p>
    </div>
  );
}

export function RevenueRealProfitChart({
  data,
  basePath,
}: {
  data: RevenueRealProfitDatum[];
  // 지정하면 막대를 눌렀을 때 `${basePath}?month=YYYY-MM`으로 이동한다(대시보드 카드에서
  // "월별 추이" 화면으로 바로 넘어가기 위함). 안 넘기면 클릭 동작 없음 — /monthly 자체
  // 화면에서는 이미 상단 월 선택 드롭다운이 있어 굳이 다시 이동시킬 필요가 없다.
  basePath?: string;
}) {
  const router = useRouter();
  const rows = data.map((d) => ({
    label: d.label,
    month: d.month,
    revenue: d.revenue,
    profitPos: d.realProfit > 0 ? d.realProfit : 0,
    profitNeg: d.realProfit < 0 ? d.realProfit : 0,
    revenueWon: d.revenueWon,
    realProfitWon: d.realProfitWon,
  }));

  // Bar 단위 onClick은 값이 0인 막대(예: 매출 0원 월)가 클릭 영역 자체를 안 만들어서
  // 못 누르는 경우가 생긴다 — 대신 차트 전체의 클릭을 받아 가장 가까운 카테고리(월)의
  // 인덱스를 Tooltip과 같은 방식(activeTooltipIndex)으로 찾는다. Tooltip의 커서
  // 하이라이트(cursor={{ fill: ... }})가 이미 그 달 전체 컬럼을 덮어주므로 UX도 맞는다.
  const handleChartClick = basePath
    ? (state: { activeTooltipIndex?: number | string | null }) => {
        // null/undefined는 "클릭 지점에 유효한 카테고리가 없음"을 뜻한다 — Number(null)이
        // 0으로 강제 변환되는 함정에 걸려 아무 데나 눌러도 1월로 튕기는 버그가 있었다.
        if (state?.activeTooltipIndex === null || state?.activeTooltipIndex === undefined) return;
        const index = Number(state.activeTooltipIndex);
        if (Number.isInteger(index) && rows[index]) {
          router.push(`${basePath}?month=${rows[index].month}`);
        }
      }
    : undefined;

  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: REVENUE }} />
          매출
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PROFIT.pos }} />
          손익(인건비·이자·감가상각 반영)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={rows}
          margin={{ top: 24, right: 8, left: 8, bottom: 24 }}
          barGap={2}
          barCategoryGap="20%"
          onClick={handleChartClick}
          style={basePath ? { cursor: "pointer" } : undefined}
        >
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
          />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />

          <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} fill={REVENUE}>
            <LabelList dataKey="revenue" content={(p) => valueLabel(p, true, false)} />
          </Bar>

          <Bar dataKey="profitPos" stackId="profit" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
            <LabelList dataKey="profitPos" content={(p) => valueLabel(p, true, true)} />
            {rows.map((r) => (
              <Cell key={r.label} fill={PROFIT.pos} />
            ))}
          </Bar>
          <Bar dataKey="profitNeg" stackId="profit" radius={[0, 0, 4, 4]} maxBarSize={22} isAnimationActive={false}>
            <LabelList dataKey="profitNeg" content={(p) => valueLabel(p, false, true)} />
            {rows.map((r) => (
              <Cell key={r.label} fill={PROFIT.neg} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
