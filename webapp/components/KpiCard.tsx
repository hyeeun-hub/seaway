import type { ReactNode } from "react";

type Variant = "default" | "dark" | "alert";

const VARIANT_STYLES: Record<Variant, { card: string; label: string; value: string; sub: string }> = {
  default: {
    card: "bg-white border border-slate-200",
    label: "text-slate-500",
    value: "text-slate-900",
    sub: "text-slate-400",
  },
  dark: {
    card: "bg-slate-900 border border-slate-900",
    label: "text-slate-400",
    value: "text-white",
    sub: "text-slate-400",
  },
  alert: {
    card: "bg-red-50 border border-red-100",
    label: "text-red-500",
    value: "text-red-600",
    sub: "text-red-400",
  },
};

export function KpiCard({
  label,
  value,
  sublabel,
  variant = "default",
}: {
  label: string;
  value: string;
  sublabel?: ReactNode;
  variant?: Variant;
}) {
  const s = VARIANT_STYLES[variant];
  return (
    <div className={`rounded-xl p-4 ${s.card}`}>
      <p className={`text-xs ${s.label}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1.5 whitespace-nowrap ${s.value}`}>{value}</p>
      {sublabel && <p className={`text-xs mt-1 ${s.sub}`}>{sublabel}</p>}
    </div>
  );
}
