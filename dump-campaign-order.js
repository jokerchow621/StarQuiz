const fs = require("fs");
const path = require("path");
const Puzzle = require("./puzzle.js");

const order = [0];
const t0 = Date.now();

Puzzle.CHAPTERS.forEach(function (ch) {
  const rows = [];
  for (let lv = ch.from; lv <= ch.to; lv++) {
    const p = Puzzle.generateSourceLevel(lv);
    rows.push({
      source: lv,
      score: p.difficulty,
      steps: p.rating ? p.rating.logicSteps : 0,
    });
  }
  rows.sort(function (a, b) {
    if (a.score !== b.score) return a.score - b.score;
    if (a.steps !== b.steps) return a.steps - b.steps;
    return a.source - b.source;
  });
  rows.forEach(function (row, i) {
    order[ch.from + i] = row.source;
  });
  console.log(
    "order",
    ch.label,
    rows[0].score + "->" + rows[rows.length - 1].score,
    Date.now() - t0 + "ms"
  );
});

const file = path.join(__dirname, "puzzle.js");
const src = fs.readFileSync(file, "utf8");
const marker = /\/\* <CAMPAIGN_SOURCE> \*\/[\s\S]*?\/\* <\/CAMPAIGN_SOURCE> \*\//;
if (!marker.test(src)) throw new Error("找不到 CAMPAIGN_SOURCE 標記");
const next = src.replace(
  marker,
  "/* <CAMPAIGN_SOURCE> */\n  var CAMPAIGN_SOURCE = " + JSON.stringify(order) + ";\n  /* </CAMPAIGN_SOURCE> */"
);
fs.writeFileSync(file, next);
console.log("wrote campaign order", order.length - 1);
