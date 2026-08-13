"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { won } from "@/lib/format";

export interface ComparisonDatum {
  label: string;
  revenue: number; // 백만원 단위, 막대 높이용
  cost: number;
  revenueWon: number; // 정확한 원 단위 값 — 툴팁용
  costWon: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: { revenueWon: number; costWon: number } }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="text-blue-600">
        매출 <span className="font-medium">{won(d.revenueWon)}</span>
      </p>
      <p className="text-slate-500">
        매입 <span className="font-medium text-slate-900">{won(d.costWon)}</span>
      </p>
    </div>
  );
}

export function MonthlyComparisonChart({ data }: { data: ComparisonDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} />
        <Legend
          verticalAlign="top"
          align="left"
          height={28}
          iconType="circle"
          wrapperStyle={{ fontSize: 12, color: "#475569" }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
        <Bar dataKey="revenue" name="매출" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="cost" name="매입" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
