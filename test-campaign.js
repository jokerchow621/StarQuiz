const Puzzle = require("./puzzle.js");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(Puzzle.TOTAL_LEVELS === 999, "總關卡應為 999");
assert(Puzzle.CHAPTERS[0].from === 1, "第一章應從 1 開始");
assert(Puzzle.CHAPTERS[Puzzle.CHAPTERS.length - 1].to === 999, "最後一章應到 999");

let covered = 0;
Puzzle.CHAPTERS.forEach(function (ch, i) {
  covered += ch.to - ch.from + 1;
  if (i > 0) assert(ch.from === Puzzle.CHAPTERS[i - 1].to + 1, "章節必須連續");
  if (i > 0) assert(ch.n > Puzzle.CHAPTERS[i - 1].n, "格數必須由少到多");
});
assert(covered === 999, "章節覆蓋必須剛好 999");

const samples = [1, 5, 6, 250, 251, 451, 651, 821, 999];
const keys = {};
samples.forEach(function (lv) {
  const a = Puzzle.generateLevel(lv);
  const b = Puzzle.generateLevel(lv);
  assert(Puzzle.puzzleKey(a) === Puzzle.puzzleKey(b), "同一關必須固定: " + lv);
  assert(Puzzle.validateRegions(a.regions, a.stars), "色塊不合法: " + lv);
  assert(Puzzle.starsAreLegal(a.stars), "星星不合法: " + lv);
  assert(Puzzle.countSolutions(a.regions, 3) === 1, "不是唯一解: " + lv);
  const spec = Puzzle.levelSpec(lv);
  assert(a.n === spec.n, "格數不符: " + lv);
  const rated = Puzzle.scoreDifficulty(a.regions, a.stars);
  assert(rated.score >= 1 && rated.score <= 100, "難度分數必須在 1-100: " + lv + " = " + rated.score);
  assert(a.difficulty === rated.score, "關卡應帶有評分: " + lv);
  const key = Puzzle.puzzleKey(a);
  assert(!keys[key], "關卡重複: " + lv + " 與 " + keys[key]);
  keys[key] = lv;
  console.log("ok level", lv, spec.n + "x" + spec.n, spec.label, rated.score);
});

function chapterTrend(from, to, step) {
  const early = [];
  const late = [];
  const mid = (from + to) / 2;
  for (let lv = from; lv <= to; lv += step) {
    const p = Puzzle.generateLevel(lv);
    const score = Puzzle.scoreDifficulty(p.regions, p.stars).score;
    if (lv < mid) early.push(score);
    else late.push(score);
  }
  const avg = function (arr) {
    return arr.reduce(function (a, b) {
      return a + b;
    }, 0) / arr.length;
  };
  const e = avg(early);
  const l = avg(late);
  assert(l > e, "後半難度應高於前半: " + from + "-" + to + " " + e + " -> " + l);
  console.log("trend", from + "-" + to, Math.round(e), "->", Math.round(l));
}

chapterTrend(6, 250, 35);
chapterTrend(251, 450, 35);
chapterTrend(451, 650, 40);

for (let lv = 251; lv <= 290; lv++) {
  const p = Puzzle.generateSourceLevel(lv);
  const s = Puzzle.scoreDifficulty(p.regions, p.stars);
  assert(s.singleton <= 2, "6x6 前段單格過多: 第 " + lv + " 關有 " + s.singleton + " 個");
  assert(s.leftoverStars <= 2, "6x6 前段過難: 第 " + lv + " 關 leftover " + s.leftoverStars);
}
for (let lv = 411; lv <= 430; lv++) {
  const p = Puzzle.generateSourceLevel(lv);
  const s = Puzzle.countSingletons(p.regions);
  assert(s === 0, "6x6 後半不應有單格: 第 " + lv + " 關有 " + s + " 個");
}

function assertUniqueShapes(from, to) {
  const seen = {};
  for (let lv = from; lv <= to; lv++) {
    const p = Puzzle.generateLevel(lv);
    const k = Puzzle.canonicalShapeKey(p.regions);
    assert(!seen[k], "形狀重複（含旋轉／翻轉）: 第 " + lv + " 關與第 " + seen[k] + " 關");
    seen[k] = lv;
    if (Puzzle.SHAPE_BANK_COMPACT[Puzzle.campaignSource(lv)]) {
      const packed = Puzzle.compactShapeKey(k);
      assert(
        packed === Puzzle.SHAPE_BANK_COMPACT[Puzzle.campaignSource(lv)],
        "與形狀庫不符: 第 " + lv + " 關"
      );
    }
    if (lv > from) {
      const prev = Puzzle.generateLevel(lv - 1);
      assert(
        p.difficulty + 0.01 >= prev.difficulty,
        "章內難度應由低到高: 第 " + (lv - 1) + " 關 " + prev.difficulty + " > 第 " + lv + " 關 " + p.difficulty
      );
    }
  }
  console.log("unique shapes", from + "-" + to, Object.keys(seen).length);
}

const bank = Puzzle.SHAPE_BANK_COMPACT;
assert(bank.length === Puzzle.TOTAL_LEVELS + 1, "形狀庫應涵蓋 999 關");
const bankSeen = {};
for (let lv = 1; lv <= Puzzle.TOTAL_LEVELS; lv++) {
  const spec = Puzzle.levelSpec(lv);
  const id = spec.n + ":" + bank[lv];
  assert(bank[lv], "形狀庫缺第 " + lv + " 關");
  assert(!bankSeen[id], "形狀庫重複: 第 " + lv + " 關與第 " + bankSeen[id] + " 關");
  bankSeen[id] = lv;
}
console.log("shape bank unique", Puzzle.TOTAL_LEVELS);

assertUniqueShapes(1, 5);
assertUniqueShapes(6, 40);
assertUniqueShapes(251, 280);
assertUniqueShapes(651, 720);
assertUniqueShapes(821, 860);

for (let lv = 675; lv <= 692; lv++) {
  const p = Puzzle.generateLevel(lv);
  assert(Puzzle.countSolutions(p.regions, 3) === 1, "675-692 必須唯一解: " + lv);
}

console.log("all passed");
