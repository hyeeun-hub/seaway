// lib/quoteSimulator.ts의 왕복 검증 + 실데이터 확인. `npx tsx --env-file=.env scripts/test-quote-simulator.mjs`로 실행.
import assert from "node:assert/strict";
import {
  computeAllocatedOverhead,
  computeBreakEven,
  evaluateQuote,
  scanBidRange,
  getOverheadBaseline,
} from "../lib/quoteSimulator.ts";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log("   " + (err instanceof Error ? err.message : String(err)));
    failed++;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log("   " + (err instanceof Error ? err.message : String(err)));
    failed++;
  }
}

console.log("=== 왕복 검증 ===");

check("breakEvenDirectCost를 직접원가로 넣으면 actualProfit === 0", () => {
  const contractAmount = 750_000_000;
  const allocatedOverhead = 45_000_000;
  const be = computeBreakEven({ contractAmount, allocatedOverhead });
  const q = evaluateQuote({ contractAmount, directCostEstimate: be.breakEvenDirectCost, allocatedOverhead });
  assert.ok(Math.abs(q.actualProfit) < 1e-6, `actualProfit=${q.actualProfit}`);
});

check("targetDirectCost를 넣으면 actualProfitRate === targetProfitRate", () => {
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

console.log("\n=== 입력 검증 ===");

check("concurrentProjects = 0 → 에러 발생", () => {
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

check("durationMonths = 0 → 에러 발생", () => {
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

check("scanBidRange의 minimumBidForTarget는 실제로 목표를 처음 만족하는 지점", () => {
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
  assert.ok(row.meetsTarget, "minimumBidForTarget 행이 meetsTarget=false");
  const prevRow = scan.rows.find((r) => r.bidAmount === scan.minimumBidForTarget - 10_000_000);
  if (prevRow) assert.ok(!prevRow.meetsTarget, "직전 스텝이 이미 목표 충족 — 최소값이 아님");
});

console.log("\n=== 실데이터 대조 ===");

const baseline = await getOverheadBaseline();

await checkAsync("getOverheadBaseline: 월 인건비 × 개월수 = 기존 손익 화면 인건비 총액(70,176,302)", () => {
  const laborTotal = Math.round(baseline.monthlyLabor * baseline.monthCount);
  assert.equal(laborTotal, 70_176_302, `계산값=${laborTotal}`);
});

console.log(`\n${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
