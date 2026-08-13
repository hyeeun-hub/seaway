"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { won } from "@/lib/format";

function Bar({ label, rate, value, colorClass }: { label: string; rate: number; value: string; colorClass: string }) {
  const pct = Math.max(0, Math.min(100, rate * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-32 text-right text-slate-700 shrink-0">
        {value} ({(rate * 100).toFixed(1)}%)
      </span>
    </div>
  );
}

// 계약금액은 추정/자동 채움 금지 — 사람이 입력하기 전까지는 "미입력"으로만 표시한다.
// 더미 값을 실제 값처럼 보여주면 안 되므로, null이 아닐 때만 청구율/원가율을 계산한다.
export function ContractProgress({
  projectName,
  contractAmt,
  revenue,
  cost,
}: {
  projectName: string;
  contractAmt: number | null;
  revenue: number;
  cost: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = Number(value.replace(/[,\s]/g, ""));
    if (!value.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      alert("올바른 계약금액을 입력하세요");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/projects/contract-amount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, contractAmt: parsed }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "저장 실패");
      setEditing(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (contractAmt === null) {
    return (
      <div onClick={(e) => e.stopPropagation()} className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
        <span>계약금액 — (미입력)</span>
        {!editing ? (
          <>
            <span className="text-slate-400">💡 계약금액을 입력하면 청구 가능 금액까지 계산됩니다.</span>
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50"
            >
              계약금액 입력
            </button>
          </>
        ) : (
          <>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="예: 92000000"
              className="rounded-lg border border-slate-200 px-2 py-0.5 w-32"
            />
            <button
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-slate-900 text-white px-2 py-0.5 disabled:opacity-40"
            >
              저장
            </button>
            <button disabled={busy} onClick={() => setEditing(false)} className="text-slate-400">
              취소
            </button>
          </>
        )}
      </div>
    );
  }

  const billedRate = revenue / contractAmt;
  const costRate = cost / contractAmt;
  const unbilledAmount = contractAmt - revenue;

  return (
    <div onClick={(e) => e.stopPropagation()} className="text-xs space-y-1.5">
      <div className="flex justify-between text-slate-600">
        <span>계약금액</span>
        <span className="font-medium text-slate-900">{won(contractAmt)}</span>
      </div>
      <Bar label="청구액" rate={billedRate} value={won(revenue)} colorClass="bg-blue-500" />
      <Bar label="투입원가" rate={costRate} value={won(cost)} colorClass="bg-orange-500" />
      <div className="flex justify-between text-slate-600 pt-0.5">
        <span>미청구 가능액</span>
        <span className="font-medium text-slate-900">{won(unbilledAmount)}</span>
      </div>
    </div>
  );
}
