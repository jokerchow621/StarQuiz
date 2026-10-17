const Puzzle = require("./puzzle.js");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function checkPuzzle(puzzle) {
  const { n, regions, stars } = puzzle;
  assert(stars.length === n, "星星列數不符");
  assert(Puzzle.starsAreLegal(stars), "星星行列或鄰接不合法");
  assert(Puzzle.validateRegions(regions, stars), "色塊連通或每區一星不成立");
  assert(Puzzle.countSolutions(regions, 3) === 1, "題目不是唯一解");

  const found = Puzzle.findSolution(regions);
  assert(found && found.join(",") === stars.join(","), "解算器與生成星星不一致");

  const seenCols = new Set();
  const seenRegions = new Set();
  for (let r = 0; r < n; r++) {
    const c = stars[r];
    assert(!seenCols.has(c), "同一直列有兩顆星");
    seenCols.add(c);
    const region = regions[r][c];
    assert(!seenRegions.has(region), "同一色塊有兩顆星");
    seenRegions.add(region);
    if (r > 0) {
      assert(Math.abs(stars[r - 1] - c) >= 2, "相鄰列的星星距離不足");
    }
  }
}

const sizes = [5, 6, 7, 8];
const perSize = 4;

for (const n of sizes) {
  const t0 = Date.now();
  for (let i = 0; i < perSize; i++) {
    checkPuzzle(Puzzle.generatePuzzle(n, 800));
  }
  console.log("ok " + n + "x" + n + " x" + perSize + "  " + (Date.now() - t0) + "ms");
}

checkPuzzle(Puzzle.generatePuzzle(9, 800));
console.log("ok 9x9 x1");

[5, 6, 7, 8, 9].forEach(function (n) {
  checkPuzzle(Puzzle.fallbackPuzzle(n));
});
console.log("ok fallbacks");

(function () {
  const stars = [0, 2, 4, 6, 8, 1, 3, 5, 7];
  const blank = Array.from({ length: 9 }, () => Array(9).fill(-1));
  const blankReport = Puzzle.explainDesign(blank, stars);
  assert(!blankReport.ok, "空白盤應不成題");
  assert(blankReport.reasons.some((line) => line.includes("沒有上色")), "空白盤應說明未上色");
  assert(blankReport.reasons.some((line) => line.includes("還沒用到")), "空白盤應說明缺色");

  const rows = stars.map((_, r) => Array(9).fill(r));
  const multi = Puzzle.explainDesign(rows, stars);
  assert(!multi.ok, "整列同色應不是唯一解");
  assert(multi.reasons.some((line) => line.includes("唯一解")), "應說明不是唯一解: " + multi.reasons.join(" / "));
  assert(multi.alt && multi.alt.length === 9, "非唯一解應附上另一種擺法");

  let hinted = null;
  for (let i = 0; i < 120 && !hinted; i++) {
    const placed = Puzzle.generateStarPlacement(9);
    const grown = placed && Puzzle.growRegions(9, placed);
    if (!grown || !Puzzle.validateRegions(grown, placed)) continue;
    const report = Puzzle.explainDesign(grown, placed);
    if (report.hint && report.hint.cells.length) hinted = { grown, placed, report };
  }
  assert(hinted, "應找得到可以提示改色的非唯一盤");
  const patched = hinted.grown.map((row) => row.slice());
  hinted.report.hint.cells.forEach(([r, c]) => {
    patched[r][c] = hinted.report.hint.colorId;
  });
  assert(Puzzle.validateRegions(patched, hinted.placed), "提示改色後仍應是一區一星");
  const again = Puzzle.explainDesign(patched, hinted.placed);
  if (!again.ok) {
    assert(!again.alt || again.alt.join(",") !== hinted.report.alt.join(","), "提示應拆掉剛才那種擺法");
  }

  const ready = Puzzle.fallbackPuzzle(9);
  const regions = ready.regions.map((row) => row.slice());
  const okReport = Puzzle.explainDesign(regions, ready.stars);
  assert(okReport.ok, "後備九星題應成題: " + okReport.reasons.join(" / "));
  regions[0][0] = -1;
  const hole = Puzzle.explainDesign(regions, ready.stars);
  assert(!hole.ok && hole.reasons.some((line) => line.includes("沒有上色")), "缺格應說明未上色");
})();
console.log("ok design");
console.log("all passed");
