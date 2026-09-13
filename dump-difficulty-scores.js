const fs = require("fs");
const path = require("path");
const Puzzle = require("./puzzle.js");

const TECH_LABEL = {
  singleton: "單格區域",
  nakedSingle: "唯一格",
  pointing: "指向消去",
  lookahead: "鄰接試探",
  search: "分支搜尋",
};

const rows = [];
const t0 = Date.now();
const chapterAgg = {};

for (let lv = 1; lv <= Puzzle.TOTAL_LEVELS; lv++) {
  const p = Puzzle.generateLevel(lv);
  const spec = Puzzle.levelSpec(lv);
  const rated = p.rating || Puzzle.scoreDifficulty(p.regions, p.stars);
  const target = Math.round(Puzzle.targetDifficulty(spec));
  const row = {
    l: lv,
    n: spec.n,
    c: spec.label,
    s: rated.score,
    t: target,
    k: rated.hardestTechnique || "",
    st: rated.logicSteps || 0,
  };
  rows.push(row);
  if (!chapterAgg[spec.label]) {
    chapterAgg[spec.label] = { n: spec.n, from: lv, to: lv, scores: [] };
  }
  chapterAgg[spec.label].to = lv;
  chapterAgg[spec.label].scores.push(rated.score);
  if (lv % 100 === 0 || lv === Puzzle.TOTAL_LEVELS) {
    console.log("score", lv + "/" + Puzzle.TOTAL_LEVELS, Date.now() - t0 + "ms");
  }
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

Puzzle.CHAPTERS.forEach(function (ch) {
  const a = chapterAgg[ch.label];
  const scores = a.scores;
  console.log(
    ch.label,
    ch.n + "x" + ch.n,
    a.from + "-" + a.to,
    "min=" + Math.min.apply(null, scores),
    "avg=" + (Math.round(avg(scores) * 10) / 10),
    "max=" + Math.max.apply(null, scores)
  );
});

const all = rows.map((r) => r.s);
console.log(
  "all min=" + Math.min.apply(null, all),
  "avg=" + (Math.round(avg(all) * 10) / 10),
  "max=" + Math.max.apply(null, all),
  "ge90=" + all.filter((s) => s >= 90).length
);

const outJson = path.join(__dirname, "levels-difficulty.json");
fs.writeFileSync(outJson, JSON.stringify(rows));
console.log("wrote", outJson);

const canvasPath = "/Users/joker/.cursor/projects/Users-joker-Desktop-StarQuiz/canvases/level-difficulty-scores.canvas.tsx";
try {
  let canvas = fs.readFileSync(canvasPath, "utf8");
  const payload = JSON.stringify(rows);
  const next = canvas.replace(
    /const LEVELS: LevelRow\[\] = \[[\s\S]*?\];/,
    "const LEVELS: LevelRow[] = " + payload + ";"
  );
  if (next === canvas) throw new Error("未能更新 canvas LEVELS");
  fs.writeFileSync(canvasPath, next);
  console.log("updated canvas", rows.length, "levels");
} catch (err) {
  console.log("canvas write skipped:", err.message);
}
