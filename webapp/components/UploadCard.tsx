"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Card } from "@/components/Card";

interface UploadResult {
  fileName: string;
  status: "processed" | "skipped_duplicate" | "rejected";
  txAdded?: number;
  anomalies?: string[];
}

export function UploadCard({ statusText }: { statusText: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[] | null>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      list.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 처리 중 오류가 발생했습니다");
      setResults(data.results);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const fileCount = results?.length ?? 0;
  const addedTotal = results?.reduce((s, r) => s + (r.txAdded ?? 0), 0) ?? 0;
  const liveStatus = results
    ? `분석 완료 · 파일 ${fileCount}개 · 신규 거래 ${addedTotal.toLocaleString()}건 처리`
    : statusText;

  return (
    <Card title="ERP 파일 업로드">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xls,.xlsx"
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <Upload size={20} className="text-slate-400" />
        <p className="text-sm text-slate-600">파일을 끌어다 놓거나 클릭해 선택</p>
        <p className="text-xs text-slate-400">매출·매입 원장 (.xls, .xlsx) · 최대 20MB</p>
      </label>

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex-1 rounded-lg bg-slate-900 text-white text-sm font-medium py-2 disabled:opacity-40"
        >
          {busy ? "처리 중…" : "분석 실행"}
        </button>
        <button
          onClick={() => router.refresh()}
          className="rounded-lg border border-slate-200 text-slate-600 text-sm px-3 hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

      <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        {liveStatus}
      </div>

      {results && results.some((r) => r.anomalies && r.anomalies.length > 0) && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-600">
          {results
            .filter((r) => r.anomalies && r.anomalies.length > 0)
            .map((r, i) => (
              <li key={i}>
                {r.fileName}: {r.anomalies!.join("; ")}
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
