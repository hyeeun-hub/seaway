"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";

export function AddCalendarEntryButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState<"매출" | "매입">("매출");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, label, amount: Number(amount), side }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "추가 실패");
      setOpen(false);
      setDate("");
      setLabel("");
      setAmount("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium px-3 py-1.5"
      >
        <Plus size={15} />
        회수 일정 추가
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-lg p-4 z-10">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-slate-900">일정 추가</p>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              placeholder="거래처/설명"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <input
              type="number"
              placeholder="금액(원)"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
            />
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "매출" | "매입")}
              className="text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
            >
              <option value="매출">매출(회수)</option>
              <option value="매입">매입(결제)</option>
            </select>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              disabled={busy}
              className="rounded-lg bg-slate-900 text-white text-sm py-1.5 disabled:opacity-40"
            >
              {busy ? "추가 중…" : "추가"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
