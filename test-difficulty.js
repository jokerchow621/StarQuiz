const Puzzle = require("./puzzle.js");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const weights = Puzzle.DIFFICULTY_WEIGHTS;
const weightSum = weights.grid + weights.solving + weights.technique + weights.steps;
assert(Math.abs(weightSum - 1) < 1e-9, "權重總和必須為 1");
assert(Puzzle.DIFFICULTY_MAX === 100, "上限必須為 100");

function checkRating(rated, label) {
  assert(rated.score >= 1 && rated.score <= 100, label + " 分數超出 1-100: " + rated.score);
  assert(rated.maxScore === 100, label + " 缺少上限");
  ["grid", "solving", "technique", "steps"].forEach(function (key) {
    assert(rated.parts[key] >= 0 && rated.parts[key] <= 100, label + " 分項超出範圍: " + key);
    assert(rated.weighted[key] >= 0, label + " 加權不可為負: " + key);
  });
  const summed =
    rated.weighted.grid + rated.weighted.solving + rated.weighted.technique + rated.weighted.steps;
  assert(Math.abs(Math.round(Math.min(100, Math.max(1, summed))) - rated.score) < 1e-9, label + " 加權結果不一致");
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

console.log("all passed");
