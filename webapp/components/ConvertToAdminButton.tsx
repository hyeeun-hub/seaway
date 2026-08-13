"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 잘못 등록된(사실은 프로젝트가 아닌) proj 값을 일반관리비 규칙으로 옮긴다.
// AdminCategoryRule에 matchOn:"proj" 규칙을 추가하고 즉시 재분류해서, 다음 업로드부터는
// 물론이고 지금 화면에서도 바로 일반관리비로 이동한 결과를 보여준다.
export function ConvertToAdminButton({ proj }: { proj: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("일반관리비");
  const [busy, setBusy] = useState(false);

  async function convert() {
    if (!category.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchOn: "proj", pattern: proj, category: category.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "등록 실패");
      const reclassifyRes = await fetch("/api/reclassify", { method: "POST" });
      if (!reclassifyRes.ok) throw new Error("재분류 실패");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-xs text-slate-400 hover:text-red-600 underline underline-offset-2"
      >
        일반관리비로 변경
      </button>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="분류명"
        className="text-xs rounded border border-slate-200 px-1.5 py-0.5 w-24"
      />
      <button
        disabled={busy}
        onClick={convert}
        className="text-xs rounded bg-red-600 text-white px-2 py-0.5 disabled:opacity-40"
      >
        확정
      </button>
      <button
        disabled={busy}
        onClick={() => setOpen(false)}
        className="text-xs text-slate-400"
      >
        취소
      </button>
    </div>
  );
}
