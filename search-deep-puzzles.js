// Offline, deterministic search. Example:
// node search-deep-puzzles.js 9 3 120 /tmp/deep-boards.jsonl
// Each emitted board has a unique solution, connected regions, and a COMPLETE
// depth certificate. Import selected shapes into campaign-candidates.json,
// then run build-campaign.js. A search timeout is never a depth certificate.
const fs = require("fs");
const Puzzle = require("./puzzle.js");
const Reasoning = require("./reasoning.js");

const n = Number(process.argv[2] || 9);
const target = Number(process.argv[3] || 2);
const seconds = Number(process.argv[4] || 60);
const output = process.argv[5] || "/tmp/starquiz-deep-boards.jsonl";
if (![5, 6, 7, 8, 9].includes(n) || !Number.isInteger(target) || target < 1 || target > 5 ||
    !Number.isFinite(seconds) || seconds <= 0) {
  throw new Error("Expected size 5-9, depth 1-5 and positive search seconds");
}
let seed = 111782;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
function measure(regions) {
  const proof = Reasoning.analyze(regions, { maxDepth: target - 1, maxNodes: 250000 });
  if (proof.limitReached) return null;
  const remaining = proof.complete ? 0 : proof.layers[proof.layers.length - 1].remaining;
  return { proof, score: remaining * 1000000 + proof.nodes };
}
const seeds = Puzzle.SHAPE_BANK_COMPACT.slice(1).map(shape =>
  shape.split("/").map(row => row.split("").map(Number))
).filter(regions => regions.length === n).map(regions => ({
  n, regions, stars: Puzzle.findSolution(regions),
}));
const seen = new Set(seeds.map(p => Puzzle.canonicalShapeKey(p.regions)));
const deadline = Date.now() + seconds * 1000;
let best = -1, tested = 0, found = 0;
while (Date.now() < deadline) {
  let puzzle = seeds[Math.floor(random() * seeds.length)];
  let measured = measure(puzzle.regions);
  if (!measured) continue;
  for (let step = 0; step < 3000 && Date.now() < deadline; step++) {
    const r = Math.floor(random() * n), c = Math.floor(random() * n);
    if (puzzle.stars[r] === c) continue;
    const neighbours = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) =>
      y >= 0 && x >= 0 && y < n && x < n && puzzle.regions[y][x] !== puzzle.regions[r][c]
    );
    if (!neighbours.length) continue;
    const [y, x] = neighbours[Math.floor(random() * neighbours.length)];
    const regions = puzzle.regions.map(row => row.slice());
    regions[r][c] = regions[y][x];
    if (!Puzzle.validateRegions(regions, puzzle.stars) || Puzzle.countSolutions(regions, 2) !== 1) continue;
    tested++;
    const candidate = measure(regions);
    if (!candidate) continue;
    const next = { n, regions, stars: puzzle.stars };
    if (candidate.score > best) { best = candidate.score; seeds.push(next); }
    if (!candidate.proof.complete) {
      const shape = Puzzle.compactShapeKey(Puzzle.canonicalShapeKey(regions));
      const key = Puzzle.canonicalShapeKey(regions);
      if (!seen.has(key)) {
        seen.add(key);
        const canonical = shape.split("/").map(row => row.split("").map(Number));
        const proof = Reasoning.analyze(canonical);
        if (proof.complete && proof.assumptionDepth >= target &&
            Puzzle.validateRegions(canonical, proof.solution) && Puzzle.countSolutions(canonical, 2) === 1) {
          fs.appendFileSync(output, JSON.stringify({ shape, depth: proof.assumptionDepth }) + "\n");
          found++;
        }
      }
    }
    const temperature = 2 + 5 * (1 - step / 3000);
    if (candidate.score >= measured.score || random() < Math.exp((candidate.score - measured.score) / temperature)) {
      puzzle = next;
      measured = candidate;
    }
  }
}
console.log(JSON.stringify({ n, target, tested, certified: found, output }));
