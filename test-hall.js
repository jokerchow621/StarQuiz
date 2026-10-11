const assert = require("node:assert/strict");
const Puzzle = require("./puzzle.js");
const Reasoning = require("./reasoning.js");

// Independent oracle: the production model uses Hall subsets; this oracle
// instead asks whether each edge participates in a bipartite perfect matching.
// It deliberately does not import any propagation helper from reasoning.js.
function hasPerfectMatching(neighbors, forcedLeft = -1, forcedRight = -1) {
  const owners = Array(neighbors.length).fill(-1);
  if (forcedLeft >= 0) {
    if (!neighbors[forcedLeft].includes(forcedRight)) return false;
    owners[forcedRight] = forcedLeft;
  }
  function assign(left, seen) {
    for (const right of neighbors[left]) {
      if (right === forcedRight || seen.has(right)) continue;
      seen.add(right);
      if (owners[right] < 0 || assign(owners[right], seen)) {
        owners[right] = left;
        return true;
      }
    }
    return false;
  }
  for (let left = 0; left < neighbors.length; left++) {
    if (left !== forcedLeft && !assign(left, new Set())) return false;
  }
  return true;
}

function openingOracle(regions, useMatching = true) {
  const n = regions.length;
  const cells = Array.from({ length: n * n }, (_, id) => {
    const r = Math.floor(id / n), c = id % n;
    return { id, r, c, region: regions[r][c], groups: [r, c, regions[r][c]] };
  });
  const groups = Array.from({ length: n * 3 }, () => []);
  cells.forEach(cell => cell.groups.forEach((group, family) => groups[family * n + group].push(cell)));
  let active = new Set(cells.map(cell => cell.id));
  function compatible(a, b) {
    return a.id === b.id || (a.r !== b.r && a.c !== b.c && a.region !== b.region &&
      (Math.abs(a.r - b.r) > 1 || Math.abs(a.c - b.c) > 1));
  }
  for (;;) {
    const remove = new Set();
    for (const cell of cells) {
      if (!active.has(cell.id)) continue;
      if (groups.some(group => !group.some(other => active.has(other.id) && compatible(cell, other)))) {
        remove.add(cell.id);
      }
    }
    if (useMatching) {
      for (let first = 0; first < 3; first++) {
        for (let second = first + 1; second < 3; second++) {
          const neighborSets = Array.from({ length: n }, () => new Set());
          cells.forEach(cell => {
            if (active.has(cell.id)) neighborSets[cell.groups[first]].add(cell.groups[second]);
          });
          const neighbors = neighborSets.map(set => [...set]);
          if (!hasPerfectMatching(neighbors)) return null;
          const unsupported = neighbors.map((row, left) => new Set(row.filter(right =>
            !hasPerfectMatching(neighbors, left, right))));
          cells.forEach(cell => {
            if (active.has(cell.id) && unsupported[cell.groups[first]].has(cell.groups[second])) {
              remove.add(cell.id);
            }
          });
        }
      }
    }
    if (!remove.size) break;
    active = new Set([...active].filter(id => !remove.has(id)));
    if (groups.some(group => !group.some(cell => active.has(cell.id)))) return null;
  }
  return Array.from({ length: n }, (_, r) => cells.filter(cell =>
    cell.r === r && active.has(cell.id)).map(cell => cell.c));
}

function verifyOpening(regions, expectedSolution, label) {
  const expected = openingOracle(regions);
  const opening = Reasoning.analyze(regions, { maxDepth: 0 });
  if (expected === null) {
    assert.equal(opening.contradiction, true, label + ": missed contradiction");
    assert.equal(opening.assumptionDepth, null, label + ": contradiction is not a solved board");
    return opening;
  }
  assert.deepEqual(opening.domains, expected, label + ": exact deterministic candidate closure");
  assert.equal(opening.layers[0].candidates, expected.reduce((sum, row) => sum + row.length, 0), label);
  assert.equal(opening.layers[0].probes, 0, label + ": deterministic exclusions must not use assumptions");
  if (expectedSolution) expectedSolution.forEach((c, r) =>
    assert.ok(expected[r].includes(c), label + ": deterministic exclusion removed the real star"));
  assert.equal(opening.complete, expected.every(row => row.length === 1), label + ": solved state");
  return opening;
}

function legalStarPlacements(n) {
  const placements = [];
  function visit(stars, used) {
    if (stars.length === n) {
      placements.push(stars.slice());
      return;
    }
    for (let c = 0; c < n; c++) {
      if (used.has(c) || (stars.length && Math.abs(c - stars[stars.length - 1]) <= 1)) continue;
      stars.push(c);
      used.add(c);
      visit(stars, used);
      used.delete(c);
      stars.pop();
    }
  }
  visit([], new Set());
  return placements;
}

function verifySeededSoundness() {
  let seed = 0x48514c32;
  function random(size) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 0x100000000 * size);
  }
  let checked = 0;
  for (const n of [4, 5, 6]) {
    const placements = legalStarPlacements(n);
    for (let sample = 0; sample < 40; sample++) {
      // Region connectivity is irrelevant to the counting proof; these small
      // constraint boards exercise cases beyond the connected campaign bank.
      const regions = Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => r === 0 ? c : random(n)));
      const solutions = placements.filter(stars =>
        new Set(stars.map((c, r) => regions[r][c])).size === n);
      const domains = openingOracle(regions);
      const label = "seeded " + n + "x" + n + " board " + sample;
      verifyOpening(regions, null, label);
      if (domains === null) {
        assert.equal(solutions.length, 0, label + ": a Hall contradiction must have no legal answer");
      } else {
        for (const solution of solutions) solution.forEach((c, r) =>
          assert.ok(domains[r].includes(c), label + ": every legal answer must survive"));
        if (domains.every(row => row.length === 1)) {
          assert.equal(solutions.length, 1, label + ": a solved closure must have exactly one answer");
          assert.deepEqual(domains.map(row => row[0]), solutions[0], label);
        }
      }
      checked++;
    }
  }
  assert.equal(checked, 120);
}

function run() {
  const hallPair = [[0, 1], [0, 1], [0, 1, 2]];
  assert.equal(hasPerfectMatching(hallPair), true);
  assert.equal(hasPerfectMatching(hallPair, 2, 0), false, "A Hall pair occupies both columns");
  assert.equal(hasPerfectMatching(hallPair, 2, 2), true);
  const hallTriple = [[0, 1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2, 3]];
  assert.equal(hasPerfectMatching(hallTriple, 3, 1), false, "Hall triples must also exclude");
  assert.equal(hasPerfectMatching([[0], [0], [1, 2]]), false, "Hall deficit is a contradiction");
  verifySeededSoundness();

  const fixtures = [
    ["9x9-harder-a.json", 0],
    ["9x9-harder-b.json", 1],
    ["9x9-candidate.json", 1],
  ];
  for (const [file, depth] of fixtures) {
    const fixture = require("./experimental/" + file);
    const opening = verifyOpening(fixture.regions, fixture.solution, file);
    const ordinary = openingOracle(fixture.regions, false);
    const ordinaryCount = ordinary.reduce((sum, row) => sum + row.length, 0);
    assert.ok(opening.layers[0].candidates < ordinaryCount, file + ": Hall deductions must add real eliminations");
    const proof = Reasoning.analyze(fixture.regions);
    assert.equal(proof.complete, true, file);
    assert.equal(proof.assumptionDepth, depth, file + ": corrected nested depth");
    assert.deepEqual(proof.solution, fixture.solution, file + ": original unique answer preserved");
    assert.equal(Puzzle.countSolutions(fixture.regions, 2), 1, file);
    assert.equal(Puzzle.validateRegions(fixture.regions, proof.solution), true, file);
    if (depth > 0) {
      assert.equal(opening.complete, false, file + ": still requires an assumption after Hall exclusions");
      assert.equal(opening.lowerBound, 1, file);
    }
    let rotated = fixture.regions;
    for (let turn = 0; turn < 4; turn++) {
      for (const board of [rotated, rotated.map(row => row.slice().reverse())]) {
        const solution = Puzzle.findSolution(board);
        verifyOpening(board, solution, file + ": symmetry " + turn);
        assert.equal(Reasoning.analyze(board).assumptionDepth, depth, file + ": rotation/reflection depth");
        const renamed = board.map(row => row.map(id => board.length - 1 - id));
        assert.deepEqual(openingOracle(renamed), openingOracle(board), file + ": region-name independence");
        verifyOpening(renamed, solution, file + ": renamed symmetry " + turn);
      }
      rotated = rotated[0].map((_, c) => rotated.map(row => row[c]).reverse());
    }
  }

  const ambiguous = Array.from({ length: 5 }, (_, r) => Array(5).fill(r));
  verifyOpening(ambiguous, null, "multiple-answer board");
  assert.equal(Reasoning.analyze(ambiguous, { maxDepth: 2 }).complete, false);
  verifyOpening([[0, 0], [1, 1]], null, "impossible adjacency board");
  console.log("all passed: independent perfect-matching oracle, 120 exhaustive soundness checks, corrected fixtures, Hall pairs/triples and eight symmetries");
}

if (require.main === module) run();
module.exports = { openingOracle, verifyOpening, hasPerfectMatching };
