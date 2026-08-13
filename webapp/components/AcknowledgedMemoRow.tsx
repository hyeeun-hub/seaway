"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { won } from "@/lib/format";

export function AcknowledgedMemoRow({
  id,
  transaction: tx,
}: {
  id: string;
  transaction: {
    date: string;
    place: string;
    proj: string;
    amount: number | null;
    memo: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  async function unack() {
    setBusy(true);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "unack" }),
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

  return (
    <li className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
      <div className="flex flex-wrap items-baseline gap-2">
        <span>{tx.date}</span>
        <span>{tx.place}</span>
        <span>{won(tx.amount)}</span>
        {tx.proj && <span>· {tx.proj}</span>}
        <span className="italic">&ldquo;{tx.memo}&rdquo;</span>
      </div>
      <button
        disabled={busy}
        onClick={unack}
        className="text-xs rounded-lg border border-slate-200 text-slate-500 px-2 py-1 disabled:opacity-40 shrink-0"
      >
        확인 취소
      </button>
    </li>
  );
}
