// Construct connected corridors around planted stars, then reshape several
// boundaries together to link local choices into a deferred contradiction.
// Example: node design-puzzles.js 8 2 60 /tmp/designed-boards.jsonl
// The requested depth is a constraint to VERIFY, never a label to assign.
const fs = require("fs");
const Puzzle = require("./puzzle.js");
const Reasoning = require("./reasoning.js");
const n = Number(process.argv[2] || 8);
const target = Number(process.argv[3] || 2);
const seconds = Number(process.argv[4] || 60);
const output = process.argv[5] || "/tmp/starquiz-designed.jsonl";
if (![5, 6, 7, 8, 9].includes(n) || !Number.isInteger(target) || target < 1 || target > 5 ||
    !Number.isFinite(seconds) || seconds <= 0) throw new Error("Invalid size, depth or duration");
let seed = 10249213;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];

function certifyLayout(regions) {
  const stars = Puzzle.findSolution(regions);
  if (!stars || !Puzzle.validateRegions(regions, stars) || Puzzle.countSolutions(regions, 2) !== 1) return null;
  return { n, regions, stars };
}

function construct() {
  const stars = Puzzle.generateStarPlacement(n, random);
  const regions = Array.from({ length: n }, () => Array(n).fill(-1));
  stars.forEach((c, r) => { regions[r][c] = r; });
  const heading = Array.from({ length: n }, () => Math.floor(random() * 4));
  for (let step = 0; step < n * n; step++) {
    const moves = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const id = regions[r][c];
      if (id < 0) continue;
      directions.forEach(([dr, dc], direction) => {
        const y = r + dr, x = c + dc;
        if (y >= 0 && x >= 0 && y < n && x < n && regions[y][x] < 0) {
          moves.push({ y, x, id, weight: direction === heading[id] ? 7 : 1 });
        }
      });
    }
    if (!moves.length) break;
    let choice = random() * moves.reduce((sum, move) => sum + move.weight, 0);
    let chosen = moves[moves.length - 1];
    for (const move of moves) { choice -= move.weight; if (choice < 0) { chosen = move; break; } }
    regions[chosen.y][chosen.x] = chosen.id;
    if (random() < 0.12) heading[chosen.id] = (heading[chosen.id] + 1) % 4;
  }
  return certifyLayout(regions);
}

function reshape(puzzle) {
  const regions = puzzle.regions.map(row => row.slice());
  // Several changes are validated as one design step. A single boundary move
  // can break uniqueness before the matching corridor change restores it.
  const changes = 1 + Math.floor(random() * 6);
  for (let i = 0; i < changes; i++) {
    const r = Math.floor(random() * n), c = Math.floor(random() * n);
    // Occasionally move a planted star's boundary too, allowing a different
    // unique solution instead of freezing the original star arrangement.
    if (puzzle.stars[r] === c && random() < 0.75) continue;
    const neighbours = directions.map(([dr, dc]) => [r + dr, c + dc]).filter(([y, x]) =>
      y >= 0 && x >= 0 && y < n && x < n && regions[y][x] !== regions[r][c]);
    if (!neighbours.length) continue;
    const [y, x] = neighbours[Math.floor(random() * neighbours.length)];
    regions[r][c] = regions[y][x];
  }
  return certifyLayout(regions);
}

function measure(puzzle) {
  const proof = Reasoning.analyze(puzzle.regions, { maxDepth: target - 1 });
  if (proof.limitReached || proof.contradiction) return null;
  return { proof, score: (proof.complete ? 0 : proof.layers[proof.layers.length - 1].remaining) * 1000000 + proof.nodes };
}

const seeds = Puzzle.SHAPE_BANK_COMPACT.slice(1).map(shape =>
  shape.split("/").map(row => row.split("").map(Number))).filter(regions => regions.length === n)
  .map(certifyLayout).filter(Boolean);
const seen = new Set(seeds.map(puzzle => Puzzle.canonicalShapeKey(puzzle.regions)));
const deadline = Date.now() + seconds * 1000;
let best = -1, tested = 0, found = 0;
while (Date.now() < deadline) {
  let puzzle = random() < 0.2 ? construct() : seeds[Math.floor(random() * seeds.length)];
  if (!puzzle) continue;
  let measured = measure(puzzle);
  if (!measured) continue;
  for (let step = 0; step < 1500 && Date.now() < deadline; step++) {
    const next = reshape(puzzle);
    if (!next) continue;
    tested++;
    const candidate = measure(next);
    if (!candidate) continue;
    if (candidate.score > best) { best = candidate.score; seeds.push(next); }
    if (!candidate.proof.complete) {
      const key = Puzzle.canonicalShapeKey(next.regions);
      if (!seen.has(key)) {
        seen.add(key);
        const shape = Puzzle.compactShapeKey(key);
        const regions = shape.split("/").map(row => row.split("").map(Number));
        const proof = Reasoning.analyze(regions);
        if (proof.complete && proof.assumptionDepth >= target &&
            Puzzle.validateRegions(regions, proof.solution) && Puzzle.countSolutions(regions, 2) === 1) {
          fs.appendFileSync(output, JSON.stringify({ shape, depth: proof.assumptionDepth }) + "\n");
          found++;
        }
      }
    }
    const temperature = 2 + 10 * (1 - step / 1500);
    if (candidate.score >= measured.score || random() < Math.exp((candidate.score - measured.score) / temperature)) {
      puzzle = next;
      measured = candidate;
    }
  }
}
console.log(JSON.stringify({ n, target, tested, certified: found, output }));
