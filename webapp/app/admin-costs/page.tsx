import Link from "next/link";
import { Card } from "@/components/Card";
import { ExpandableAdminRow } from "@/components/ExpandableAdminRow";
import { won } from "@/lib/format";
import { getAdminCategoryBreakdown, getAdminCategoryTransactions } from "@/lib/aggregate";

export const dynamic = "force-dynamic";

const UNCLASSIFIED_CATEGORY = "미분류 일반관리비";

export default async function AdminCostsPage() {
  const [rows, txByCategory] = await Promise.all([
    getAdminCategoryBreakdown(),
    getAdminCategoryTransactions(),
  ]);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">일반관리비</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            프로젝트에 속하지 않는 공통 비용 · 합계 {won(total)}
          </p>
        </div>
        <Link
          href="/settings"
          className="text-sm text-blue-600 hover:text-blue-700 shrink-0"
        >
          분류 규칙 관리 →
        </Link>
      </header>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-4 font-medium">분류</th>
              <th className="py-2 pr-4 font-medium text-right">건수</th>
              <th className="py-2 font-medium text-right">금액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <ExpandableAdminRow
                key={r.category}
                category={r.category}
                count={r.count}
                amount={r.amount}
                transactions={txByCategory.get(r.category) ?? []}
                badge={r.category === UNCLASSIFIED_CATEGORY ? "자동 처리(금액 기준)" : undefined}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-slate-400">
                  일반관리비로 분류된 항목이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
