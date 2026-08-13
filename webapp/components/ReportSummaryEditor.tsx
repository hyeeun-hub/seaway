"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReportSummaryEditor({
  month,
  initialText,
  initialConfirmedAt,
}: {
  month: string;
  initialText: string;
  initialConfirmedAt: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "save" | "confirm" | "regenerate") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/monthly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, summaryText: text, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리 실패");
      setText(data.state.summaryText);
      setConfirmedAt(data.state.confirmedAt);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">요약 문구</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            템플릿 자동 생성 · 수정 가능
            {confirmedAt && (
              <span className="text-emerald-600 ml-1.5">· 확정됨({confirmedAt.slice(0, 10)})</span>
            )}
          </p>
        </div>
        <button
          onClick={() => act("regenerate")}
          disabled={busy !== null}
          className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          템플릿 다시 생성
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setConfirmedAt(null);
        }}
        rows={5}
        className="w-full mt-3 text-sm text-slate-700 rounded-lg border border-slate-200 p-3 resize-none"
      />
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={() => window.print()}
          className="text-sm rounded-lg border border-slate-200 px-4 py-1.5 text-slate-600 hover:bg-slate-50"
        >
          PDF 내보내기
        </button>
        <button
          onClick={() => act("confirm")}
          disabled={busy !== null}
          className="text-sm rounded-lg bg-blue-600 text-white px-4 py-1.5 disabled:opacity-40"
        >
          {busy === "confirm" ? "확정 중…" : "리포트 확정"}
        </button>
      </div>
    </div>
  );
}
