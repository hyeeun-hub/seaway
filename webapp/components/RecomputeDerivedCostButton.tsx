"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { won } from "@/lib/format";

// 파생원가(인건비·이자·감가상각)는 파일을 올린다고 자동으로 계산되지 않는다 — 대출/자산
// 마스터와 급여대장/4대보험 거래를 바탕으로 이 버튼을 눌러야 DerivedCost가 채워진다.
// /quote(수주 판단)의 월 고정비 기준선이 이 데이터에 의존한다.
export function RecomputeDerivedCostButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/derived-cost/recompute", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "계산 실패");
      const r = data.result;
      setResult(
        `${r.rowCount}건 재계산 · 인건비 ${won(r.laborTotal)} + 이자 ${won(r.interestTotal)} + 감가상각 ${won(r.depreciationTotal)} = 합계 ${won(r.grandTotal)}` +
          (r.uncalculableLoans.length > 0
            ? ` · 연이율 미기재로 제외된 대출 ${r.uncalculableLoans.length}건`
            : ""),
      );
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">파생원가 재계산</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            대출/자산 마스터, 급여대장·4대보험 거래를 기준으로 인건비·이자·감가상각을 다시
            계산합니다. 마스터 파일을 새로 올렸거나 값이 바뀌었을 때 눌러야 하며, 대시보드의
            &quot;진짜 손익&quot;과 &quot;수주 판단&quot; 화면의 월 고정비가 이 값을 씁니다.
            매번 전량 재생성하며 기존 값을 이어 계산하지 않습니다.
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-40"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          {busy ? "계산 중…" : "파생원가 재계산 실행"}
        </button>
      </div>
      {result && <p className="text-xs text-slate-600 mt-3 bg-slate-50 rounded-lg px-3 py-2">{result}</p>}
    </div>
  );
}
