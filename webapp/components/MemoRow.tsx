"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { won } from "@/lib/format";
import { PROBLEM_TYPE } from "@/lib/problemTypes";

const STATUS_LABEL: Record<string, string> = {
  needs_review: "검수 대기",
  auto_confirmed: "손익 반영",
  confirmed: "확정됨",
  modified: "수정 확정",
  excluded: "제외됨",
  hold: "보류",
};

interface MemoRowProps {
  id: string;
  status: string;
  problemType: string;
  transaction: {
    date: string;
    place: string;
    proj: string;
    amount: number | null;
    memo: string;
  };
}

// 이 컴포넌트는 항상 "아직 확인 안 함" 상태인 건만 받는다(서버에서 이미 필터링됨).
// 확인함을 누르면 이 목록에서 사라지고(hidden), 새로고침 후 "확인된 항목" 목록에 나타난다.
export function MemoRow({ id, status, problemType, transaction: tx }: MemoRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [flagged, setFlagged] = useState(problemType === PROBLEM_TYPE.MEMO_NEEDS_REVIEW);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [customKeyword, setCustomKeyword] = useState("");
  const [registered, setRegistered] = useState<string[]>([]);

  const risky = flagged;

  async function flag() {
    setBusy(true);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "flag" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리 실패");
      setFlagged(true);
      setCandidates(data.candidates ?? []);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function ack() {
    setBusy(true);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "ack" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "처리 실패");
      setHidden(true);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  async function registerKeyword(pattern: string) {
    if (!pattern.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchOn: "memo_keyword", pattern: pattern.trim(), category: "위험 키워드" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "등록 실패");
      setRegistered((prev) => [...prev, pattern.trim()]);
      setCustomKeyword("");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-2.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        {risky && <span title="위험 신호">⚠️</span>}
        <span className="text-slate-500">{tx.date}</span>
        <span className="text-slate-800 font-medium">{tx.place}</span>
        <span className="text-slate-900">{won(tx.amount)}</span>
        {tx.proj && <span className="text-slate-400">· {tx.proj}</span>}
        <span
          className={`text-xs rounded-full px-2 py-0.5 font-medium ${
            status === "needs_review"
              ? "bg-amber-50 text-amber-600"
              : status === "excluded" || status === "hold"
                ? "bg-slate-100 text-slate-500"
                : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <p className={`text-xs ${risky ? "text-red-600" : "text-violet-600"}`}>&ldquo;{tx.memo}&rdquo;</p>

      <div className="flex flex-wrap items-center gap-2">
        {!risky && (
          <button
            disabled={busy}
            onClick={flag}
            className="text-xs rounded-lg bg-red-600 text-white px-2 py-1 disabled:opacity-40"
          >
            문제 있음
          </button>
        )}
        <button
          disabled={busy}
          onClick={ack}
          className="text-xs rounded-lg border border-slate-300 text-slate-600 px-2 py-1 disabled:opacity-40"
        >
          확인함
        </button>
      </div>

      {candidates.length > 0 && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 flex flex-col gap-1.5">
          <p className="text-xs text-slate-500">
            이 메모에서 다음 표현을 발견했습니다. 앞으로 이 표현이 포함된 메모도 자동으로 위험
            표시할까요?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => (
              <button
                key={c}
                disabled={busy || registered.includes(c)}
                onClick={() => registerKeyword(c)}
                className="text-xs rounded-full border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {registered.includes(c) ? `${c} (등록됨)` : `"${c}" 등록`}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={customKeyword}
              onChange={(e) => setCustomKeyword(e.target.value)}
              placeholder="직접 입력"
              className="text-xs rounded-lg border border-slate-200 px-2 py-1 w-32"
            />
            <button
              disabled={busy || !customKeyword.trim()}
              onClick={() => registerKeyword(customKeyword)}
              className="text-xs rounded-lg bg-slate-900 text-white px-2 py-1 disabled:opacity-40"
            >
              등록
            </button>
            <button
              disabled={busy}
              onClick={() => setCandidates([])}
              className="text-xs text-slate-400"
            >
              이번만
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
