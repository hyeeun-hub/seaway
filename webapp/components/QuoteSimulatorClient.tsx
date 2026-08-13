"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { won as formatWon } from "@/lib/format";
import { simulateQuote, recalcConcurrentProjects, type SimulateQuoteInput, type SimulateQuoteResult } from "@/app/quote/actions";

const EOK = 100_000_000;
const eokToWon = (eok: number) => Math.round(eok * EOK);
const wonToEok = (won: number) => won / EOK;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
// 견적 계산은 동시 진행 현장 수로 나누는 등 나눗셈이 들어가 원 단위로 딱 맞지 않는다
// (예: 3곳으로 나누면 소수점이 생김). 화면 표시는 원 단위로 반올림한다 — 계산값 자체는
// lib/quoteSimulator.ts가 그대로 반환한 실수를 유지하므로 재계산 시 오차가 누적되지 않는다.
const won = (n: number) => formatWon(Math.round(n));

interface UncalculableLoan {
  loanCode: string;
  reason: string;
}

export function QuoteSimulatorClient({
  initialInput,
  initialResult,
  initialConcurrentBasis,
  initialConcurrentProjects,
  monthCount,
  loanCount,
  assetCount,
  uncalculableLoans,
}: {
  initialInput: SimulateQuoteInput;
  initialResult: SimulateQuoteResult;
  initialConcurrentBasis: string;
  initialConcurrentProjects: string[];
  monthCount: number;
  loanCount: number;
  assetCount: number;
  uncalculableLoans: UncalculableLoan[];
}) {
  // 금액은 화면에서 억 단위로 다루고, 서버 액션 호출 시점에만 원 단위로 환산한다.
  const [bidMinEok, setBidMinEok] = useState(wonToEok(initialInput.bidMin));
  const [bidMaxEok, setBidMaxEok] = useState(wonToEok(initialInput.bidMax));
  const [bidStepEok, setBidStepEok] = useState(wonToEok(initialInput.bidStep));
  const [directCostEok, setDirectCostEok] = useState(wonToEok(initialInput.directCostEstimate));
  const [targetProfitPct, setTargetProfitPct] = useState(initialInput.targetProfitRate * 100);
  const [durationMonths, setDurationMonths] = useState(initialInput.durationMonths);
  const [concurrentProjects, setConcurrentProjects] = useState(initialInput.concurrentProjects);
  const [materialCostRatioPct, setMaterialCostRatioPct] = useState(initialInput.materialCostRatio * 100);
  const [materialPriceChangePct, setMaterialPriceChangePct] = useState(initialInput.materialPriceChange * 100);
  const [delayMonths, setDelayMonths] = useState(initialInput.delayMonths);

  const [concurrentBasis, setConcurrentBasis] = useState(initialConcurrentBasis);
  const [concurrentProjectsList, setConcurrentProjectsList] = useState(initialConcurrentProjects);
  const [recalcPending, startRecalcTransition] = useTransition();

  const [result, setResult] = useState<SimulateQuoteResult>(initialResult);
  const [isPending, startTransition] = useTransition();

  // "결과" 패널의 기준 금액. null이면 투찰 금액대의 중간값을 쓴다(7.0억~8.0억 → 7.5억).
  // 스캔 표의 행을 클릭하면 그 금액으로 고정되고, 금액대(min/max)를 바꾸면 다시 중간값으로
  // 초기화된다 — 범위만 넓혔는데 기준이 그대로 남아 있으면 더 헷갈리기 때문이다.
  const [selectedBidEok, setSelectedBidEok] = useState<number | null>(null);
  // 금액대(min/max)가 바뀌면 선택을 초기화한다. useEffect 대신 렌더 중 비교하는 React의
  // "prop이 바뀌면 state를 리셋" 패턴을 쓴다 — effect 안에서 setState하면 렌더가 한 번 더
  // 낭비된다.
  const [prevRange, setPrevRange] = useState({ min: bidMinEok, max: bidMaxEok });
  if (prevRange.min !== bidMinEok || prevRange.max !== bidMaxEok) {
    setPrevRange({ min: bidMinEok, max: bidMaxEok });
    setSelectedBidEok(null);
  }

  const bidCenterEok = selectedBidEok ?? (bidMinEok + bidMaxEok) / 2;
  const bidCenter = eokToWon(bidCenterEok);
  const bidCenterSource =
    selectedBidEok !== null
      ? "스캔 표에서 선택함"
      : `금액대 ${bidMinEok.toFixed(2)}억~${bidMaxEok.toFixed(2)}억의 중간값`;

  useEffect(() => {
    const timer = setTimeout(() => {
      const input: SimulateQuoteInput = {
        bidCenter,
        directCostEstimate: eokToWon(directCostEok),
        targetProfitRate: targetProfitPct / 100,
        durationMonths,
        concurrentProjects,
        bidMin: eokToWon(bidMinEok),
        bidMax: eokToWon(bidMaxEok),
        bidStep: eokToWon(bidStepEok),
        materialCostRatio: materialCostRatioPct / 100,
        materialPriceChange: materialPriceChangePct / 100,
        delayMonths,
      };
      startTransition(async () => {
        const r = await simulateQuote(input);
        setResult(r);
      });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bidMinEok,
    bidMaxEok,
    bidStepEok,
    selectedBidEok,
    directCostEok,
    targetProfitPct,
    durationMonths,
    concurrentProjects,
    materialCostRatioPct,
    materialPriceChangePct,
    delayMonths,
  ]);

  function handleRecalcConcurrent() {
    startRecalcTransition(async () => {
      try {
        const r = await recalcConcurrentProjects(durationMonths);
        setConcurrentProjects(r.count);
        setConcurrentBasis(r.basis);
        setConcurrentProjectsList(r.projects);
      } catch (err) {
        setConcurrentBasis(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const monthlyTotal = result.monthlyLabor + result.monthlyInterest + result.monthlyDepreciation + result.monthlyCommonCost;

  const loanBasis =
    uncalculableLoans.length > 0
      ? `대출 ${loanCount}건 중 ${uncalculableLoans.map((l) => l.loanCode).join(", ")} 연이율 미기재로 제외`
      : `대출 ${loanCount}건 반영`;

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header>
        <h1 className="text-lg font-bold text-slate-900">수주 판단</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          견적 단계에서 배부 고정비까지 반영한 실제 이익을 미리 계산합니다. 과거 원가율로
          예측하지 않고, 계약금액에서 배부 고정비를 역산합니다.
        </p>
      </header>

      {result.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          ⚠ 입력값을 계산할 수 없습니다: {result.error}
        </div>
      )}

      {/* ===== 구역 1: 대표님이 정하실 것 ===== */}
      <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-blue-900">대표님이 정하실 것</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="투찰 금액대">
            <div className="flex items-center gap-1.5 text-sm">
              <EokInput value={bidMinEok} onChange={setBidMinEok} />
              <span className="text-slate-400">~</span>
              <EokInput value={bidMaxEok} onChange={setBidMaxEok} />
              <span className="text-slate-400 ml-1">간격</span>
              <EokInput value={bidStepEok} onChange={setBidStepEok} step={0.01} />
            </div>
          </Field>

          <Field label="공사기간">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={durationMonths}
                onChange={(e) => setDurationMonths(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-500">개월</span>
            </div>
          </Field>

          <Field label="목표 이익률">
            <SliderWithNumber
              value={targetProfitPct}
              onChange={setTargetProfitPct}
              min={0}
              max={50}
              step={1}
              unit="%"
            />
          </Field>

          <Field label="동시 진행 현장">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <SliderWithNumber
                  value={concurrentProjects}
                  onChange={setConcurrentProjects}
                  min={0}
                  max={10}
                  step={1}
                  unit="곳"
                />
                <button
                  type="button"
                  onClick={handleRecalcConcurrent}
                  disabled={recalcPending}
                  title="공사기간을 기준으로 겹치는 진행 중 공사 수를 다시 계산합니다"
                  className="shrink-0 rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-white disabled:opacity-40"
                >
                  <RefreshCw size={14} className={recalcPending ? "animate-spin" : ""} />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {concurrentBasis}
                {concurrentProjectsList.length > 0 && ` (${concurrentProjectsList.join(", ")})`}
              </p>
            </div>
          </Field>
        </div>

        <div className="pt-2 border-t border-blue-100">
          <Field label="직접원가 견적">
            <EokInput value={directCostEok} onChange={setDirectCostEok} />
          </Field>

          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-white border border-emerald-100 px-3 py-2">
              <p className="font-medium text-emerald-700 mb-1">직접원가 견적에 포함할 것</p>
              <ul className="space-y-0.5 text-slate-600">
                <li>☑ 자재비</li>
                <li>☑ 외주비</li>
                <li>☑ 일용직 인건비</li>
                <li>☑ 장비 임차료</li>
              </ul>
            </div>
            <div className="rounded-lg bg-white border border-red-100 px-3 py-2">
              <p className="font-medium text-red-700 mb-1">포함하지 마세요 — 도구가 자동 반영합니다</p>
              <ul className="space-y-0.5 text-slate-600">
                <li>✕ 상시직 급여</li>
                <li>✕ 4대보험·퇴직충당</li>
                <li>✕ 사무실 임차료</li>
                <li>✕ 차입금 이자</li>
                <li>✕ 설비 감가상각</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            급여대장 &lsquo;구분&rsquo; 컬럼의 경계선입니다 — 일용직은 직접원가에, 상시직은 배부
            고정비로 자동 반영됩니다. 같은 돈을 두 번 빼면 받아도 되는 공사를 포기하게 됩니다.
          </p>
        </div>
      </section>

      {/* ===== 구역 2: 데이터에서 자동 계산됨 ===== */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2.5">
        <h2 className="text-sm font-semibold text-slate-700">데이터에서 자동 계산됨</h2>
        <OverheadRow label="상시직 인건비" monthly={result.monthlyLabor} basis={`DerivedCost 인건비 합계 ÷ ${monthCount}개월(급여대장·4대보험·퇴직충당 실데이터)`} />
        <OverheadRow label="이자" monthly={result.monthlyInterest} basis={loanBasis} />
        <OverheadRow label="감가상각" monthly={result.monthlyDepreciation} basis={`자산 ${assetCount}건 정액법`} />
        <OverheadRow label="공통고정비" monthly={result.monthlyCommonCost} basis={`최근 ${monthCount}개월 일반관리비 평균`} />
        <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
          <span className="text-slate-700">월 고정비 합계</span>
          <span className="text-slate-900">{won(monthlyTotal)}</span>
        </div>
        <p className="text-xs text-slate-400">
          ℹ️ 배부 고정비는 동시 진행 현장 수로 나눈 값입니다. 여러 견적을 비교할 때는 동시 진행
          현장 수를 동일하게 입력하세요.
        </p>
      </section>

      {/* ===== 구역 3: 결과 ===== */}
      <section className="rounded-xl border border-slate-300 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">결과 — 투찰금액 {won(bidCenter)} 기준</h2>
            <p className="text-xs text-slate-400 mt-0.5">({bidCenterSource})</p>
          </div>
          {isPending && <span className="text-xs text-slate-400">재계산 중...</span>}
        </div>

        {result.quote && result.breakEven && result.overhead ? (
          <div className="text-sm space-y-1.5 max-w-md">
            <Row label="계약금액" value={won(bidCenter)} />
            <Row label="직접원가 견적" value={`−${won(eokToWon(directCostEok))}`} />
            <div className="border-t border-slate-200" />
            <Row
              label="겉보기 이익"
              value={`${won(result.quote.contributionMargin)} (${pct(result.quote.contributionRate)})`}
              hint="지금 ERP가 그대로 보여주는 숫자 — 배부 고정비를 반영하기 전입니다"
            />
            <Row label="배부 고정비" value={`−${won(result.overhead.allocatedTotal)}`} />
            <div className="border-t-2 border-slate-300" />
            <div className="flex items-end justify-between">
              <span className="font-semibold text-slate-900">실제 이익</span>
              <span
                className={`text-2xl font-bold ${result.quote.actualProfit < 0 ? "text-red-600" : "text-blue-700"}`}
              >
                {won(result.quote.actualProfit)}{" "}
                <span className="text-base">({pct(result.quote.actualProfitRate)})</span>
              </span>
            </div>
            {!result.quote.meetsTarget && (
              <p className="text-xs text-red-600 font-medium text-right">⚠ 목표 이익률 미달</p>
            )}

            <div className="pt-2 space-y-1.5">
              <Row
                label={`손익분기 직접원가 (투찰금액 ${won(bidCenter)} 기준)`}
                value={`${won(result.breakEven.breakEvenDirectCost)} (원가율 ${pct(result.breakEven.breakEvenCostRate)})`}
              />
              <div className="flex items-end justify-between pt-1">
                <span className="font-semibold text-slate-900">목표 {targetProfitPct.toFixed(0)}% 달성 최소 투찰금액</span>
                <span className="text-xl font-bold text-slate-900">
                  {result.scan?.minimumBidForTarget != null
                    ? won(result.scan.minimumBidForTarget)
                    : "이 범위에서는 목표 달성 불가"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">입력값을 수정하면 결과가 표시됩니다.</p>
        )}
      </section>

      {/* ===== 구역 3-보조: 투찰 금액대별 스캔 표 ===== */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">투찰 금액대별 실제 이익</h2>
        <p className="text-xs text-slate-400">행을 클릭하면 그 금액이 위 &lsquo;결과&rsquo; 패널의 기준이 됩니다.</p>
        {result.scan ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-4 font-medium">투찰 금액</th>
                    <th className="py-1.5 pr-4 font-medium text-right">실제 이익</th>
                    <th className="py-1.5 font-medium text-right">이익률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {result.scan.rows.map((row) => {
                    const isMinimum = row.bidAmount === result.scan!.minimumBidForTarget;
                    const isSelected = Math.abs(row.bidAmount / EOK - bidCenterEok) < 0.001;
                    return (
                      <tr
                        key={row.bidAmount}
                        onClick={() => setSelectedBidEok(row.bidAmount / EOK)}
                        className={`cursor-pointer hover:bg-slate-50 ${
                          isSelected ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300" : isMinimum ? "bg-blue-50" : ""
                        }`}
                      >
                        <td className="py-1.5 pr-4 text-slate-700">
                          {(row.bidAmount / EOK).toFixed(2)}억
                          {isSelected && <span className="ml-1.5 text-xs text-emerald-700 font-medium">← 현재 선택</span>}
                          {isMinimum && (
                            <span className="ml-1.5 text-xs text-blue-600 font-medium">← 최소 투찰</span>
                          )}
                        </td>
                        <td
                          className={`py-1.5 pr-4 text-right font-medium ${
                            row.actualProfit < 0 ? "text-red-600" : "text-slate-800"
                          }`}
                        >
                          {won(row.actualProfit)}
                        </td>
                        <td
                          className={`py-1.5 text-right ${
                            row.meetsTarget ? "text-emerald-600" : row.actualProfit < 0 ? "text-red-600" : "text-slate-500"
                          }`}
                        >
                          {pct(row.actualProfitRate)} {row.actualProfit < 0 ? "❌" : row.meetsTarget ? "✅" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm font-medium text-slate-700">
              → 목표 {targetProfitPct.toFixed(0)}% 달성 최소 투찰금액:{" "}
              {result.scan.minimumBidForTarget != null
                ? `${(result.scan.minimumBidForTarget / EOK).toFixed(2)}억`
                : "이 범위에서는 목표 달성 불가 — 투찰 금액대를 넓혀보세요"}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">입력값을 확인해주세요.</p>
        )}
      </section>

      {/* ===== 구역 4: 민감도 ===== */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">민감도</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <Field label="자재비 비중(직접원가 중)">
            <SliderWithNumber value={materialCostRatioPct} onChange={setMaterialCostRatioPct} min={0} max={100} step={5} unit="%" />
          </Field>
          <Field label="자재비 변동">
            <SliderWithNumber value={materialPriceChangePct} onChange={setMaterialPriceChangePct} min={-30} max={30} step={1} unit="%" />
          </Field>
          <Field label="공기 지연">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={delayMonths}
                onChange={(e) => setDelayMonths(Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-500">개월</span>
            </div>
          </Field>
        </div>

        {result.sensitivity ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {result.sensitivity.scenarios.map((s, i) => {
              const isCombined = i === result.sensitivity!.scenarios.length - 1;
              const isLossFlip = isCombined && s.actualProfit < 0 && result.quote && result.quote.actualProfit >= 0;
              return (
                <li key={s.label} className="py-2 flex items-center justify-between gap-3">
                  <span className={`text-slate-600 ${isCombined ? "font-medium" : ""}`}>{s.label}</span>
                  <span className={`font-medium shrink-0 ${s.actualProfit < 0 ? "text-red-600" : "text-slate-800"}`}>
                    {won(s.actualProfit)} ({pct(s.actualProfitRate)})
                    {isLossFlip && <span className="ml-1.5 text-red-600 font-semibold">⚠ 적자 전환</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">입력값을 확인해주세요.</p>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function EokInput({ value, onChange, step = 0.1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      />
      <span className="text-slate-500">억</span>
    </span>
  );
}

function SliderWithNumber({
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      />
      <span className="text-xs text-slate-400 w-4">{unit}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-blue-600 flex-1"
      />
    </div>
  );
}

function OverheadRow({ label, monthly, basis }: { label: string; monthly: number; basis: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{basis}</p>
      </div>
      <span className="text-sm font-medium text-slate-900 shrink-0">{won(monthly)}/월</span>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-slate-600" title={hint}>
        {label}
        {hint && <span className="text-slate-300"> ⓘ</span>}
      </span>
      <span className="font-medium text-slate-900 shrink-0">{value}</span>
    </div>
  );
}
