"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { won } from "@/lib/format";
import { normalizePlacePattern } from "@/lib/normalizePlaceName";
import type { ReviewHint } from "@/lib/reviewHints";
import { PROBLEM_TYPE } from "@/lib/problemTypes";

interface ReviewRowProps {
  id: string;
  problemType: string;
  suggestion: string | null;
  suggestedCategory: string | null;
  transaction: {
    date: string;
    place: string;
    proj: string;
    amount: number | null;
    kind: string;
    use: string;
    content: string;
  };
  existingPlaceKeywords: string[];
  hint: ReviewHint | null;
}

export function ReviewRow({
  id,
  problemType,
  suggestion,
  suggestedCategory,
  transaction: tx,
  existingPlaceKeywords,
  hint,
}: ReviewRowProps) {
  const router = useRouter();
  const [category, setCategory] = useState(suggestedCategory ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [rulePrompt, setRulePrompt] = useState<{ pattern: string; category: string } | null>(null);

  // 금액 누락 건은 금액을 채워야 진짜로 해결되는 문제라, 분류 지정과는 별도 흐름으로 다룬다.
  // 채운 뒤에는 classifyTransaction이 다시 판정한 결과로 이 행을 갱신한다(자동 확정될 수도,
  // 다른 사유로 계속 검수가 필요할 수도 있다).
  const [currentProblemType, setCurrentProblemType] = useState(problemType);
  const [currentSuggestion, setCurrentSuggestion] = useState(suggestion);
  const [amountInput, setAmountInput] = useState("");
  const [currentAmount, setCurrentAmount] = useState(tx.amount);
  const [currentProj, setCurrentProj] = useState(tx.proj);
  const [hintDismissed, setHintDismissed] = useState(false);

  // 유사 거래 힌트에서 [이 현장으로 지정]을 눌렀을 때만 호출된다. 절대 자동 반영되지 않는다.
  async function assignProject(proj: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/review/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, proj }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");

      setCurrentProj(proj);
      if (data.decision.status === "auto_confirmed") {
        setDone("자동 분류됨");
      } else {
        setCurrentProblemType(data.decision.problemType);
        setCurrentSuggestion(data.decision.suggestion);
        setCategory(data.decision.suggestedCategory ?? "");
        setHintDismissed(true);
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAmount() {
    const parsed = Number(amountInput.replace(/[,\s]/g, ""));
    if (!amountInput.trim() || !Number.isFinite(parsed) || parsed < 0) {
      alert("올바른 금액을 입력하세요");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/review/amount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, amount: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");

      setCurrentAmount(data.amount);
      if (data.decision.status === "auto_confirmed") {
        setDone("자동 분류됨");
      } else {
        setCurrentProblemType(data.decision.problemType);
        setCurrentSuggestion(data.decision.suggestion);
        setCategory(data.decision.suggestedCategory ?? "");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(status: "confirmed" | "modified" | "excluded" | "hold") {
    setBusy(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          resolvedCategory: status === "confirmed" || status === "modified" ? category || null : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "처리 실패");

      const shouldSuggestRule =
        (status === "confirmed" || status === "modified") &&
        category.trim() !== "" &&
        tx.kind === "매입-간이영수증" &&
        !existingPlaceKeywords.some((p) => tx.place.includes(p));

      if (shouldSuggestRule) {
        setRulePrompt({ pattern: normalizePlacePattern(tx.place), category: category.trim() });
      } else {
        setDone(status);
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveRule() {
    if (!rulePrompt || !rulePrompt.pattern.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchOn: "place_keyword",
          pattern: rulePrompt.pattern.trim(),
          category: rulePrompt.category,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "규칙 저장 실패");
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setDone("confirmed");
      setRulePrompt(null);
      router.refresh();
    }
  }

  function skipRule() {
    setDone("confirmed");
    setRulePrompt(null);
    router.refresh();
  }

  if (rulePrompt) {
    return (
      <li className="py-3 flex flex-col gap-2 bg-slate-50 -mx-3 px-3">
        <p className="text-xs text-slate-500">
          &ldquo;{tx.place}&rdquo;를 [{rulePrompt.category}]로 확정했습니다. 다음부터 같은 사용처가 나오면
          자동 분류하도록 규칙으로 저장할까요?
        </p>
        <div className="flex items-center gap-2">
          <input
            value={rulePrompt.pattern}
            onChange={(e) => setRulePrompt({ ...rulePrompt, pattern: e.target.value })}
            className="text-xs rounded-lg border border-slate-200 px-2 py-1 w-40"
          />
          <button
            disabled={busy}
            onClick={saveRule}
            className="text-xs rounded-lg bg-emerald-600 text-white px-2 py-1 disabled:opacity-40"
          >
            규칙 저장
          </button>
          <button disabled={busy} onClick={skipRule} className="text-xs text-slate-400">
            건너뛰기
          </button>
        </div>
      </li>
    );
  }

  if (done) {
    return (
      <li className="py-2 text-sm text-slate-400">
        처리됨({done}) — {tx.date} {tx.place} {won(currentAmount)}
      </li>
    );
  }

  const isMissingAmount = currentProblemType === PROBLEM_TYPE.AMOUNT_MISSING;
  const showHint = hint && !hintDismissed && !isMissingAmount;

  return (
    <li className="py-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium text-slate-900">{currentProblemType}</span>
        <span className="text-slate-600">
          {tx.date} · {tx.place} · {won(currentAmount)} · {tx.kind}
        </span>
        {currentProj && <span className="text-slate-400">현장: {currentProj}</span>}
      </div>
      {currentSuggestion && <p className="text-xs text-slate-400">{currentSuggestion}</p>}

      {showHint && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 flex flex-col gap-1.5">
          {hint.candidates.length === 1 ? (
            <p className="text-xs text-blue-700">
              💡 {hint.basis === "place" ? "같은 사용처" : `같은 업종(${hint.keyword})`} 거래{" "}
              {hint.candidates[0].count}건이 모두 &ldquo;{hint.candidates[0].proj}&rdquo;입니다
              {hint.basis === "industry" && " (±14일 이내)"}
            </p>
          ) : (
            <p className="text-xs text-blue-700">
              💡 {hint.basis === "place" ? "같은 사용처" : `같은 업종(${hint.keyword})`} 거래 중 후보가
              둘 있습니다:
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {hint.candidates.map((c) => (
              <button
                key={c.proj}
                disabled={busy}
                onClick={() => assignProject(c.proj)}
                className="text-xs rounded-lg bg-blue-600 text-white px-2 py-1 disabled:opacity-40"
              >
                &ldquo;{c.proj}&rdquo;({c.count}건)으로 지정
              </button>
            ))}
            <button
              disabled={busy}
              onClick={() => setHintDismissed(true)}
              className="text-xs text-slate-400"
            >
              다르게 지정
            </button>
          </div>
        </div>
      )}

      {isMissingAmount ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="금액 입력"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 px-2 py-1 w-40"
          />
          <button
            disabled={busy || !amountInput.trim()}
            onClick={saveAmount}
            className="text-xs rounded-lg bg-emerald-600 text-white px-2 py-1 disabled:opacity-40"
          >
            확정
          </button>
          <button
            disabled={busy}
            onClick={() => act("hold")}
            className="text-xs rounded-lg bg-slate-500 text-white px-2 py-1 disabled:opacity-40"
          >
            보류
          </button>
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="분류/현장 지정(선택)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="text-xs rounded-lg border border-slate-200 px-2 py-1 w-48"
        />
        <button
          disabled={busy}
          onClick={() => act("confirmed")}
          className="text-xs rounded-lg bg-emerald-600 text-white px-2 py-1 disabled:opacity-40"
        >
          확정
        </button>
        <button
          disabled={busy || !category}
          onClick={() => act("modified")}
          className="text-xs rounded-lg bg-blue-600 text-white px-2 py-1 disabled:opacity-40"
        >
          수정
        </button>
        <button
          disabled={busy}
          onClick={() => act("excluded")}
          className="text-xs rounded-lg bg-red-600 text-white px-2 py-1 disabled:opacity-40"
        >
          제외
        </button>
        <button
          disabled={busy}
          onClick={() => act("hold")}
          className="text-xs rounded-lg bg-slate-500 text-white px-2 py-1 disabled:opacity-40"
        >
          보류
        </button>
      </div>
      )}
    </li>
  );
}
