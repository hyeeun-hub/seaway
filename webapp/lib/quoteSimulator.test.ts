import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAllocatedOverhead, computeBreakEven, evaluateQuote, scanBidRange } from "./quoteSimulator";

test("breakEvenDirectCost를 직접원가로 넣으면 actualProfit === 0", () => {
  const contractAmount = 750_000_000;
  const allocatedOverhead = 45_000_000;
  const be = computeBreakEven({ contractAmount, allocatedOverhead });
  const q = evaluateQuote({ contractAmount, directCostEstimate: be.breakEvenDirectCost, allocatedOverhead });
  assert.ok(Math.abs(q.actualProfit) < 1e-6, `actualProfit=${q.actualProfit}`);
});

test("targetDirectCost를 넣으면 actualProfitRate === targetProfitRate", () => {
  const contractAmount = 750_000_000;
  const allocatedOverhead = 45_000_000;
  const targetProfitRate = 0.1;
  const be = computeBreakEven({ contractAmount, allocatedOverhead, targetProfitRate });
  const q = evaluateQuote({
    contractAmount,
    directCostEstimate: be.targetDirectCost,
    allocatedOverhead,
    targetProfitRate,
  });
  assert.ok(Math.abs(q.actualProfitRate - targetProfitRate) < 1e-9, `actualProfitRate=${q.actualProfitRate}`);
});

test("concurrentProjects = 0 → 에러 발생", () => {
  assert.throws(() =>
    computeAllocatedOverhead({
      monthlyLabor: 1,
      monthlyInterest: 1,
      monthlyDepreciation: 1,
      monthlyCommonCost: 1,
      durationMonths: 5,
      concurrentProjects: 0,
    }),
  );
});

test("durationMonths = 0 → 에러 발생", () => {
  assert.throws(() =>
    computeAllocatedOverhead({
      monthlyLabor: 1,
      monthlyInterest: 1,
      monthlyDepreciation: 1,
      monthlyCommonCost: 1,
      durationMonths: 0,
      concurrentProjects: 1,
    }),
  );
});

test("scanBidRange의 minimumBidForTarget는 실제로 목표를 처음 만족하는 지점", () => {
  const scan = scanBidRange({
    min: 500_000_000,
    max: 900_000_000,
    step: 10_000_000,
    directCostEstimate: 670_000_000,
    allocatedOverhead: 45_000_000,
    targetProfitRate: 0.1,
  });
  assert.ok(scan.minimumBidForTarget !== null, "minimumBidForTarget is null");
  const row = scan.rows.find((r) => r.bidAmount === scan.minimumBidForTarget);
  assert.ok(row?.meetsTarget, "minimumBidForTarget 행이 meetsTarget=false");
  const prevRow = scan.rows.find((r) => r.bidAmount === (scan.minimumBidForTarget as number) - 10_000_000);
  if (prevRow) assert.ok(!prevRow.meetsTarget, "직전 스텝이 이미 목표 충족 — 최소값이 아님");
});
