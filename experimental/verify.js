// Run with `node experimental/verify.js` after adding or changing a fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Puzzle = require('../puzzle.js');
const Reasoning = require('../reasoning.js');
const files = fs.readdirSync(__dirname).filter(name => /^9x9-.*\.json$/.test(name)).sort();
const seen = new Set();
for (const file of files) {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  const regions = fixture.regions;
  assert.equal(regions.length, 9, file);
  assert.equal(Puzzle.compactShapeKey(Puzzle.canonicalShapeKey(regions)), fixture.shape, file);
  assert(!seen.has(fixture.shape), 'Duplicate fixture: ' + file);
  seen.add(fixture.shape);
  const proof = Reasoning.analyze(regions);
  assert.equal(proof.complete, true, file);
  assert.equal(proof.assumptionDepth, fixture.verifiedDepth, file);
  assert.equal(proof.model, fixture.model, file);
  assert.deepEqual(proof, fixture.certificate, 'Certificate changed: ' + file);
  assert.deepEqual(proof.solution, fixture.solution, file);
  assert(Puzzle.starsAreLegal(proof.solution), file);
  assert(Puzzle.validateRegions(regions, proof.solution), file);
  assert.equal(Puzzle.countSolutions(regions, 2), 1, file);
  const shallow = Reasoning.analyze(regions, { maxDepth: fixture.verifiedDepth - 1 });
  assert.equal(shallow.complete, false, 'Shallower deductions solved: ' + file);
  assert.equal(shallow.limitReached, undefined, 'Limit is not evidence: ' + file);
  assert.deepEqual(shallow, fixture.shallowerCertificate, file);
  const rating = Puzzle.scoreDifficulty(regions);
  if (fixture.orderScore !== undefined) {
    assert.equal(rating.orderScore, fixture.orderScore, file);
    assert.equal(rating.score, fixture.score, file);
    assert.equal(rating.rawScore, fixture.rawScore, file);
  }
  if (fixture.status === 'experimental-not-in-campaign') {
    assert(!Puzzle.SHAPE_BANK_COMPACT.includes(fixture.shape), file);
    assert(rating.orderScore > fixture.comparison.orderScore, 'No improvement: ' + file);
  }
  console.log(file + ': depth ' + proof.assumptionDepth + ', score ' + rating.score +
    ', orderScore ' + rating.orderScore.toFixed(6) + ', unique and connected');
}
assert(files.length > 0);
