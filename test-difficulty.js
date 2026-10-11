const Puzzle = require("./puzzle.js");
const Reasoning = require("./reasoning.js");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const weights = Puzzle.DIFFICULTY_WEIGHTS;
const weightSum = weights.grid + weights.solving + weights.technique + weights.steps;
assert(Math.abs(weightSum - 1) < 1e-9, "權重總和必須為 1");
assert(Puzzle.DIFFICULTY_MAX === 100, "上限必須為 100");

function checkRating(rated, label) {
  assert(rated.score >= 0 && rated.score <= 100, label + " 分數超出 0-100: " + rated.score);
  assert(rated.maxScore === 100, label + " 缺少上限");
  ["grid", "solving", "technique", "steps"].forEach(function (key) {
    assert(rated.parts[key] >= 0 && rated.parts[key] <= 100, label + " 分項超出範圍: " + key);
    assert(rated.weighted[key] >= 0, label + " 加權不可為負: " + key);
  });
  const summed =
    rated.weighted.grid + rated.weighted.solving + rated.weighted.technique + rated.weighted.steps;
  assert(Math.abs(Math.round(Math.min(100, Math.max(1, summed))) - rated.logicalScore) < 1e-9, label + " 邏輯指標加權結果不一致");
  assert(rated.reasoning.complete, label + " 假設深度未驗證");
  assert(Number.isInteger(rated.assumptionDepth), label + " 缺少假設深度");
  assert(rated.reasoning.model === Reasoning.MODEL, label + " 使用過期模型");
  const opening = rated.reasoning.opening;
  assert(opening.candidates >= opening.forced + opening.remaining, label + " 開局候選不合法");
  assert(opening.eliminated === opening.supportEliminations + opening.hallEliminations, label + " 排除統計不一致");
  assert(rated.residual >= 0 && rated.residual <= 1, label + " 剩餘核心超出範圍");
  const bands = [[5, 29], [30, 49], [50, 69], [70, 84], [85, 94], [95, 100]];
  const band = bands[rated.assumptionDepth];
  const expectedOrder = band[0] + (band[1] - band[0]) *
    (0.65 * rated.effort + 0.2 * rated.residual + 0.15 * rated.parts.grid / 100);
  assert(Math.abs(rated.orderScore - expectedOrder) < 1e-12, label + " 新評分加權不一致");
  assert(Array.isArray(rated.techniques), label + " 缺少技巧列表");
  assert(rated.logicSteps >= 0, label + " 推理步數不合法");
}

const samples = [1, 5, 6, 120, 250, 251, 451, 651, 821, 999];
samples.forEach(function (lv) {
  const p = Puzzle.generateLevel(lv);
  const a = Puzzle.scoreDifficulty(p.regions, p.stars);
  const b = Puzzle.scoreDifficulty(p.regions, p.stars);
  assert(a.score === b.score, "同一題評分必須固定: " + lv);
  assert(p.difficulty === a.score, "關卡分數應寫回 rating: " + lv);
  checkRating(a, "第 " + lv + " 關");
  console.log(
    "ok",
    lv,
    p.n + "x" + p.n,
    a.score,
    a.techniqueLabels.join("+") || "無",
    "steps=" + a.logicSteps
  );
});

const easy = Puzzle.scoreDifficulty(Puzzle.generateLevel(1).regions);
const hard = Puzzle.scoreDifficulty(Puzzle.generateLevel(999).regions);
assert(easy.score < hard.score, "第 1 關應比第 999 關低分: " + easy.score + " -> " + hard.score);

[5, 6, 7, 8, 9].forEach(function (n) {
  checkRating(Puzzle.scoreDifficulty(Puzzle.fallbackPuzzle(n).regions), n + " fallback");
});

// Mapping changes the scale, not the underlying reasoning or ordering.
const calibration = Puzzle.DIFFICULTY_CALIBRATION;
assert(calibration.model === Reasoning.MODEL, "校準使用過期模型");
let campaignMin = Infinity, campaignMax = -Infinity;
let minOrder = Infinity, maxOrder = -Infinity;
for (let level = 1; level <= 999; level++) {
  const rating = Puzzle.generateLevel(level).rating;
  const expected = Math.round(Math.max(0, Math.min(100,
    (rating.orderScore - calibration.minOrder) / (calibration.maxOrder - calibration.minOrder) * 100)));
  assert(rating.score === expected, "Calibration: " + level);
  campaignMin = Math.min(campaignMin, rating.score);
  campaignMax = Math.max(campaignMax, rating.score);
  minOrder = Math.min(minOrder, rating.orderScore);
  maxOrder = Math.max(maxOrder, rating.orderScore);
}
assert(campaignMin === 0 && campaignMax === 100, "Campaign must span 0–100");
assert(minOrder === calibration.minOrder && maxOrder === calibration.maxOrder, "校準必須反映完整題庫");
console.log("all passed");
