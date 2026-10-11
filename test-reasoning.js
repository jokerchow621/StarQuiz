const assert = require("node:assert/strict");
const Puzzle = require("./puzzle.js");
const Reasoning = require("./reasoning.js");
const { verifyOpening } = require("./test-hall.js");

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
const shallow = Reasoning.analyze(last.regions, { maxDepth: 0 });
assert.equal(shallow.complete, false, "The final board must resist ALL deterministic Hall deductions");
assert.equal(shallow.assumptionDepth, null);
assert.equal(shallow.lowerBound, 1);
assert.ok(shallow.layers[0].remaining > 0);
const solved = Reasoning.analyze(last.regions);
verifySolution(last.regions, solved);
assert.equal(solved.assumptionDepth, 1);

// Use an immutable board independently known to need one assumption: a board
// solved by depth-zero Hall deductions should succeed even with one node.
const oneLayerFixture = require("./experimental/9x9-harder-b.json");
const deterministicFixture = require("./experimental/9x9-harder-a.json");
const deterministic = Reasoning.analyze(deterministicFixture.regions, { maxNodes: 1 });
verifySolution(deterministicFixture.regions, deterministic);
assert.equal(deterministic.assumptionDepth, 0);
assert.equal(deterministic.limitReached, undefined);
const limited = Reasoning.analyze(oneLayerFixture.regions, { maxNodes: 1 });
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
  const expectedOrder = fixture.rating.orderScore;
  for (let rotation = 0; rotation < 4; rotation++) {
    for (const board of [transformed, transformed.map(row => row.slice().reverse())]) {
      const proof = Reasoning.analyze(board);
      verifySolution(board, proof);
      assert.equal(proof.assumptionDepth, fixture.rating.assumptionDepth);
      assert.equal(Puzzle.scoreDifficulty(board).score, expectedScore);
      assert.equal(Puzzle.scoreDifficulty(board).orderScore, expectedOrder);
      const renamed = board.map(row => row.map(id => board.length - 1 - id));
      assert.equal(Puzzle.scoreDifficulty(renamed).score, expectedScore);
      assert.equal(Puzzle.scoreDifficulty(renamed).orderScore, expectedOrder);
    }
    transformed = rotate(transformed);
  }
}

// This audited histogram records the stronger model's actual certificates.
// Previously labelled two-layer boards must not keep that label after Hall
// exclusions reduce their true required depth to zero or one.
const expectedHistogram = {
  4: { 0: 5 },
  5: { 0: 237, 1: 8 },
  6: { 0: 192, 1: 8 },
  7: { 0: 191, 1: 9 },
  8: { 0: 168, 1: 2 },
  9: { 0: 167, 1: 12 },
};
assert.equal(Reasoning.MODEL, "star-group-support-hall-failed-literal-v2");
let checked = 0;
for (const chapter of Puzzle.CHAPTERS) {
  let previous = null;
  const histogram = {};
  for (let level = chapter.from; level <= chapter.to; level++) {
    const puzzle = Puzzle.generateLevel(level);
    const proof = Reasoning.analyze(puzzle.regions);
    verifySolution(puzzle.regions, proof);
    const opening = verifyOpening(puzzle.regions, proof.solution, "level " + level);
    assert.deepEqual(proof.opening, opening.opening, "Opening metrics changed after hypotheses: " + level);
    assert.equal(proof.opening.eliminated, chapter.n * chapter.n - opening.layers[0].candidates, "Opening elimination count: " + level);
    assert.equal(proof.opening.forced, chapter.n - opening.layers[0].remaining, "Opening forced stars: " + level);
    const rated = Puzzle.scoreDifficulty(puzzle.regions);
    assert.equal(rated.assumptionDepth, proof.assumptionDepth, "Independent depth check: " + level);
    assert.equal(rated.reasoning.model, Reasoning.MODEL);
    if (previous) {
      assert.ok(rated.assumptionDepth >= previous.assumptionDepth, "Depth decreased: " + level);
      assert.ok(rated.score >= previous.score, "Score decreased: " + level);
      assert.ok(rated.orderScore >= previous.orderScore, "Precise difficulty decreased: " + level);
    }
    if (proof.assumptionDepth > 0) {
      const shallower = Reasoning.analyze(puzzle.regions, { maxDepth: proof.assumptionDepth - 1 });
      assert.equal(shallower.complete, false, "Claimed depth is unnecessarily high: " + level);
      assert.equal(shallower.limitReached, undefined, "A budget limit is not a depth certificate: " + level);
      assert.equal(shallower.lowerBound, proof.assumptionDepth, "Required depth lower bound: " + level);
    }
    previous = rated;
    histogram[proof.assumptionDepth] = (histogram[proof.assumptionDepth] || 0) + 1;
    checked++;
  }
  assert.deepEqual(histogram, expectedHistogram[chapter.n], chapter.label + " certified depth histogram");
  console.log("depth progression", chapter.label, JSON.stringify(histogram));
}
assert.equal(checked, 999);
console.log("all passed: 999 unique boards, independent Hall closure, corrected depths, all-chapter precise order, symmetries, limits and ambiguity");
