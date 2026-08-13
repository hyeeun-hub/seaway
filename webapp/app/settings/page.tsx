import Link from "next/link";
import { AdminRulesManager } from "@/components/AdminRulesManager";
import { ReclassifyButton } from "@/components/ReclassifyButton";
import { RecomputeDerivedCostButton } from "@/components/RecomputeDerivedCostButton";
import { Card } from "@/components/Card";
import { won } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { runVerifyChecks, summarizeVerify } from "@/lib/verify";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "rules", label: "분류 규칙" },
  { key: "master", label: "마스터 데이터" },
  { key: "verify", label: "검사 결과" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: requestedTab } = await searchParams;
  const tab = TABS.some((t) => t.key === requestedTab) ? requestedTab : "rules";

  return (
    <div className="p-6 space-y-5">
      <header>
        <h1 className="text-lg font-bold text-slate-900">설정·관리</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          분류 규칙을 추가/삭제하면 다음 업로드부터 바로 적용됩니다. 이미 쌓인 거래에 반영하려면
          아래 &quot;전체 재분류 실행&quot;을 눌러야 하며, 사람이 확정/제외/수정/보류한 건은 그때도 바뀌지
          않습니다.
        </p>
      </header>

      <div className="flex gap-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/settings?tab=${t.key}`}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              tab === t.key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-200/60"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "rules" ? <RulesTab /> : tab === "master" ? <MasterDataTab /> : <VerifyTab />}
    </div>
  );
}

const RESULT_STYLE: Record<string, string> = {
  통과: "bg-emerald-50 text-emerald-700 border-emerald-100",
  경고: "bg-amber-50 text-amber-700 border-amber-100",
  이상: "bg-red-50 text-red-700 border-red-100",
};

// lib/verify.ts의 검사를 전부 보여준다. 통과 항목도 숨기지 않는다("검사 결과 은닉 금지").
async function VerifyTab() {
  const checks = await runVerifyChecks();
  const summary = summarizeVerify(checks);

  const byPoint = new Map<string, typeof checks>();
  for (const c of checks) {
    const list = byPoint.get(c.point) ?? [];
    list.push(c);
    byPoint.set(c.point, list);
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold text-slate-900">
            {checks.length}개 검사 · 통과 {summary.pass} · 경고 {summary.warning} · 이상 {summary.anomaly}
          </span>
          {summary.retryNeeded && (
            <span className="text-xs rounded-full bg-red-50 text-red-600 px-2.5 py-1 font-medium">
              재확인 필요 항목 있음
            </span>
          )}
        </div>
      </Card>

      {[...byPoint.entries()].map(([point, items]) => (
        <Card key={point}>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">{point}</h2>
          <div className="space-y-3">
            {items.map((c, i) => (
              <div key={i} className={`rounded-lg border p-3 text-sm ${RESULT_STYLE[c.result]}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.item}</span>
                  <span className="text-xs font-semibold shrink-0">{c.result}</span>
                </div>
                <p className="text-xs mt-1 opacity-90">{c.detail}</p>
                {c.cause && <p className="text-xs mt-1 opacity-80">원인: {c.cause}</p>}
                {c.action && <p className="text-xs mt-0.5 opacity-80">조치: {c.action}</p>}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

async function RulesTab() {
  const rules = await prisma.adminCategoryRule.findMany({
    orderBy: [{ matchOn: "asc" }, { pattern: "asc" }],
  });
  return (
    <div className="space-y-5">
      <ReclassifyButton />
      <AdminRulesManager initialRules={rules} />
    </div>
  );
}

// L2 마스터(대출·자산·프로젝트) 조회 전용. 건수와 목록만 보여준다 — 편집 기능은 없다
// (수정은 마스터 파일을 다시 업로드해서 갱신하는 방식으로만 한다).
async function MasterDataTab() {
  const [projects, loans, assets] = await Promise.all([
    prisma.project.findMany({ orderBy: { projectCode: "asc" } }),
    prisma.loan.findMany({ orderBy: { loanCode: "asc" } }),
    prisma.asset.findMany({ orderBy: { assetCode: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <RecomputeDerivedCostButton />

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">프로젝트 마스터 · {projects.length}건</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4 font-medium">코드</th>
                <th className="py-2 pr-4 font-medium">프로젝트명</th>
                <th className="py-2 pr-4 font-medium">구분</th>
                <th className="py-2 pr-4 font-medium">발주처</th>
                <th className="py-2 pr-4 font-medium text-right">계약금액</th>
                <th className="py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="py-1.5 pr-4 text-slate-500">{p.projectCode}</td>
                  <td className="py-1.5 pr-4 text-slate-800">{p.projectName}</td>
                  <td className="py-1.5 pr-4 text-slate-600">{p.category}</td>
                  <td className="py-1.5 pr-4 text-slate-600">{p.client ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-700">
                    {p.contractAmt !== null ? won(Number(p.contractAmt)) : "—"}
                  </td>
                  <td className="py-1.5 text-slate-600">{p.status ?? "—"}</td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-slate-400">
                    등록된 프로젝트 마스터가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">대출 마스터 · {loans.length}건</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4 font-medium">코드</th>
                <th className="py-2 pr-4 font-medium">금융기관</th>
                <th className="py-2 pr-4 font-medium">종류</th>
                <th className="py-2 pr-4 font-medium text-right">원금</th>
                <th className="py-2 pr-4 font-medium text-right">연이율</th>
                <th className="py-2 pr-4 font-medium">귀속</th>
                <th className="py-2 font-medium">상환방식</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loans.map((l) => (
                <tr key={l.id}>
                  <td className="py-1.5 pr-4 text-slate-500">{l.loanCode}</td>
                  <td className="py-1.5 pr-4 text-slate-800">{l.bank}</td>
                  <td className="py-1.5 pr-4 text-slate-600">{l.loanType}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-700">{won(Number(l.principal))}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-700">
                    {l.annualRate !== null ? `${l.annualRate}%` : "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-slate-600">{l.scope}{l.projectName ? ` · ${l.projectName}` : ""}</td>
                  <td className="py-1.5 text-slate-600">{l.repayMethod}</td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-slate-400">
                    등록된 대출 마스터가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 mb-1">자산 마스터 · {assets.length}건</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4 font-medium">코드</th>
                <th className="py-2 pr-4 font-medium">자산명</th>
                <th className="py-2 pr-4 font-medium">계정</th>
                <th className="py-2 pr-4 font-medium text-right">취득가액</th>
                <th className="py-2 pr-4 font-medium text-right">월상각액</th>
                <th className="py-2 font-medium">귀속</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="py-1.5 pr-4 text-slate-500">{a.assetCode}</td>
                  <td className="py-1.5 pr-4 text-slate-800">{a.name}</td>
                  <td className="py-1.5 pr-4 text-slate-600">{a.account}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-700">{won(Number(a.acquireCost))}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-700">{won(a.monthlyDep)}</td>
                  <td className="py-1.5 text-slate-600">{a.scope}{a.projectName ? ` · ${a.projectName}` : ""}</td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-slate-400">
                    등록된 자산 마스터가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
