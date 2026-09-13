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
console.log("all passed");
