"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function ReclassifyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/reclassify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "재분류 실패");
      setResult(
        `재검토 ${data.result.reevaluated}건 중 ${data.result.changed}건 변경 · 사람이 확정한 ${data.result.skippedProtected}건은 건드리지 않음`,
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
          <h2 className="text-sm font-semibold text-slate-900">규칙 변경 후 재분류</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            위 규칙을 추가/수정한 뒤 눌러야 기존 거래에도 반영됩니다. 사람이 이미 확정/제외/수정/보류한
            건은 절대 덮어쓰지 않습니다.
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-40"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          {busy ? "재분류 중…" : "전체 재분류 실행"}
        </button>
      </div>
      {result && <p className="text-xs text-slate-600 mt-3 bg-slate-50 rounded-lg px-3 py-2">{result}</p>}
    </div>
  );
}
