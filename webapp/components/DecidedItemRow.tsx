"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { won } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  confirmed: "확정",
  modified: "수정",
  excluded: "제외",
  hold: "보류",
};

interface DecidedItemRowProps {
  id: string;
  status: string;
  resolvedCategory: string | null;
  transaction: {
    date: string;
    place: string;
    proj: string;
    amount: number | null;
  };
}

export function DecidedItemRow({ id, status, resolvedCategory, transaction: tx }: DecidedItemRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reverted, setReverted] = useState(false);

  async function revert() {
    if (!confirm("검수 목록으로 되돌릴까요?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "needs_review" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "처리 실패");
      setReverted(true);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (reverted) {
    return (
      <li className="py-2 text-sm text-slate-400">
        검수 목록으로 되돌렸습니다 — {tx.date} {tx.place}
      </li>
    );
  }

  return (
    <li className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium text-slate-700">{STATUS_LABEL[status] ?? status}</span>
        <span className="text-slate-500">
          {tx.date} · {tx.place} · {won(tx.amount)}
        </span>
        {resolvedCategory && <span className="text-slate-400">{resolvedCategory}</span>}
        {tx.proj && <span className="text-slate-400">현장: {tx.proj}</span>}
      </div>
      <button
        disabled={busy}
        onClick={revert}
        className="text-xs rounded-lg border border-slate-300 text-slate-600 px-2 py-1 disabled:opacity-40"
      >
        되돌리기
      </button>
    </li>
  );
}
