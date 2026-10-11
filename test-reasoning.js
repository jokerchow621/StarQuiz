const assert = require("node:assert/strict");
const Puzzle = require("./puzzle.js");
const Reasoning = require("./reasoning.js");

function rotate(board) {
  return board[0].map((_, c) => board.map(row => row[c]).reverse());
}
function verifySolution(board, proof) {
  assert.equal(proof.complete, true);
  assert.equal(Puzzle.starsAreLegal(proof.solution), true);
  assert.equal(Puzzle.validateRegions(board, proof.solution), true);
  assert.equal(Puzzle.countSolutions(board, 2), 1);
  assert.deepEqual(proof.solution, Puzzle.findSolution(board));
}

const first = Puzzle.generateLevel(1);
assert.equal(Reasoning.analyze(first.regions).assumptionDepth, 0);
const last = Puzzle.generateLevel(999);
const shallow = Reasoning.analyze(last.regions, { maxDepth: 1 });
assert.equal(shallow.complete, false, "The final board must resist ALL depth-one deductions");
assert.equal(shallow.assumptionDepth, null);
assert.equal(shallow.lowerBound, 2);
assert.ok(shallow.layers[1].remaining > 0);
const solved = Reasoning.analyze(last.regions);
verifySolution(last.regions, solved);
assert.ok(solved.assumptionDepth >= 2);

const limited = Reasoning.analyze(last.regions, { maxNodes: 1 });
assert.equal(limited.complete, false);
assert.equal(limited.limitReached, true);
assert.equal(limited.assumptionDepth, null, "A resource limit is not a depth certificate");
const ambiguous = Array.from({ length: 5 }, (_, r) => Array(5).fill(r));
const ambiguousProof = Reasoning.analyze(ambiguous, { maxDepth: 2 });
assert.equal(ambiguousProof.complete, false);
assert.equal(ambiguousProof.assumptionDepth, null, "Multiple solutions cannot be called solved");

for (const fixture of [last, Puzzle.generateLevel(820)]) {
  let transformed = fixture.regions;
  const expectedScore = fixture.rating.score;
  for (let rotation = 0; rotation < 4; rotation++) {
    for (const board of [transformed, transformed.map(row => row.slice().reverse())]) {
      const proof = Reasoning.analyze(board);
      verifySolution(board, proof);
      assert.equal(proof.assumptionDepth, fixture.rating.assumptionDepth);
      assert.equal(Puzzle.scoreDifficulty(board).score, expectedScore);
      const renamed = board.map(row => row.map(id => board.length - 1 - id));
      assert.equal(Puzzle.scoreDifficulty(renamed).score, expectedScore);
    }
    transformed = rotate(transformed);
  }
}

const expectedTiers = { 4: [0], 5: [0, 1], 6: [0, 1], 7: [0, 1], 8: [0, 1, 2], 9: [0, 1, 2] };
let checked = 0;
for (const chapter of Puzzle.CHAPTERS) {
  let previous = null;
  const tiers = new Set();
  for (let level = chapter.from; level <= chapter.to; level++) {
    const puzzle = Puzzle.generateLevel(level);
    const proof = Reasoning.analyze(puzzle.regions);
    verifySolution(puzzle.regions, proof);
    const rated = Puzzle.scoreDifficulty(puzzle.regions);
    assert.equal(rated.assumptionDepth, proof.assumptionDepth, "Independent depth check: " + level);
    assert.equal(rated.reasoning.model, Reasoning.MODEL);
    if (previous) {
      assert.ok(rated.assumptionDepth >= previous.assumptionDepth, "Depth decreased: " + level);
      assert.ok(rated.score >= previous.score, "Score decreased: " + level);
      if (chapter.n === 9) {
        assert.ok(rated.orderScore >= previous.orderScore, "9x9 precise difficulty decreased: " + level);
      }
    }
    if (level >= 980) assert.ok(proof.assumptionDepth >= 2, "Final twenty must require nested assumptions");
    if (level >= 811 && level <= 820) {
      assert.ok(proof.assumptionDepth >= 2, "The designed 8x8 finale must require nested assumptions");
      const oneLayer = Reasoning.analyze(puzzle.regions, { maxDepth: 1 });
      assert.equal(oneLayer.complete, false, "8x8 finale yielded to a single assumption: " + level);
    }
    previous = rated;
    tiers.add(proof.assumptionDepth);
    checked++;
  }
  assert.deepEqual([...tiers], expectedTiers[chapter.n], chapter.label + " depth progression");
  console.log("depth progression", chapter.label, [...tiers].join(" -> "));
}
assert.equal(checked, 999);
console.log("all passed: 999 unique boards, verified depths, eight symmetries, limits and ambiguity");
