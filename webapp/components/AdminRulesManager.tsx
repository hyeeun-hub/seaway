"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export interface Rule {
  id: string;
  matchOn: string;
  pattern: string;
  category: string;
}

const SECTIONS: {
  matchOn: Rule["matchOn"];
  title: string;
  help: string;
  patternLabel: string;
  placeholderCategory?: string;
}[] = [
  {
    matchOn: "proj",
    title: "일반관리비 항목 (프로젝트/현장 값 정확히 일치)",
    help: '예: "사무실운영" → 자동으로 일반관리비로 분류됩니다.',
    patternLabel: "프로젝트/현장 값",
  },
  {
    matchOn: "place_keyword",
    title: "간이영수증 사용처 키워드",
    help: "용도/내용이 비어 있는 간이영수증에서 사용처 문자열에 이 키워드가 포함되면 분류됩니다.",
    patternLabel: "키워드",
  },
  {
    matchOn: "flag_review",
    title: "확인 필요로 등록된 값",
    help: "프로젝트/현장 값이 이 목록에 있으면 자동 확정하지 않고 항상 검수 목록으로 보냅니다.",
    patternLabel: "프로젝트/현장 값",
    placeholderCategory: "확인 필요",
  },
  {
    matchOn: "memo_keyword",
    title: "메모 위험 키워드",
    help: "메모 원문에 이 표현이 포함되면 손익 반영 전 검수로 보냅니다(/memo 화면에서도 추가 가능).",
    patternLabel: "키워드",
    placeholderCategory: "위험 키워드",
  },
];

export function AdminRulesManager({ initialRules }: { initialRules: Rule[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [busy, setBusy] = useState(false);

  async function addRule(matchOn: string, pattern: string, category: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchOn, pattern, category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "추가 실패");
      setRules((prev) => [...prev.filter((r) => !(r.matchOn === matchOn && r.pattern === pattern)), data.rule]);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin-rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      setRules((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => (
        <div key={section.matchOn} className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
          <p className="text-xs text-slate-400 mt-0.5 mb-3">{section.help}</p>

          <ul className="divide-y divide-slate-50 mb-3">
            {rules
              .filter((r) => r.matchOn === section.matchOn)
              .map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-slate-700">
                    {r.pattern}
                    {section.matchOn !== "flag_review" && section.matchOn !== "memo_keyword" && (
                      <span className="text-slate-400"> → {r.category}</span>
                    )}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => deleteRule(r.id)}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            {rules.filter((r) => r.matchOn === section.matchOn).length === 0 && (
              <li className="py-2 text-sm text-slate-400">등록된 항목이 없습니다</li>
            )}
          </ul>

          <AddRuleForm
            matchOn={section.matchOn}
            patternLabel={section.patternLabel}
            showCategory={!section.placeholderCategory}
            placeholderCategory={section.placeholderCategory ?? "확인 필요"}
            busy={busy}
            onAdd={addRule}
          />
        </div>
      ))}
    </div>
  );
}

function AddRuleForm({
  matchOn,
  patternLabel,
  showCategory,
  placeholderCategory,
  busy,
  onAdd,
}: {
  matchOn: string;
  patternLabel: string;
  showCategory: boolean;
  placeholderCategory: string;
  busy: boolean;
  onAdd: (matchOn: string, pattern: string, category: string) => void;
}) {
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!pattern.trim()) return;
        onAdd(matchOn, pattern, showCategory ? category : placeholderCategory);
        setPattern("");
        setCategory("");
      }}
      className="flex gap-2"
    >
      <input
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        placeholder={patternLabel}
        className="flex-1 text-sm rounded-lg border border-slate-200 px-3 py-1.5"
      />
      {showCategory && (
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="분류명"
          className="flex-1 text-sm rounded-lg border border-slate-200 px-3 py-1.5"
        />
      )}
      <button
        disabled={busy}
        className="rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-40"
      >
        추가
      </button>
    </form>
  );
}
