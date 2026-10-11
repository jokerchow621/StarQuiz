// Offline builder. Run `node build-campaign.js` after updating
// campaign-candidates.json. Never run this search in the browser.
const fs = require("fs");
const path = require("path");
const Puzzle = require("./puzzle.js");
const Reasoning = require("./reasoning.js");

function decode(shape) {
  return shape.split("/").map(row => row.split("").map(Number));
}

function certify(regions) {
  const shape = Puzzle.compactShapeKey(Puzzle.canonicalShapeKey(regions));
  regions = decode(shape);
  const proof = Reasoning.analyze(regions);
  if (!proof.complete || proof.assumptionDepth === null) throw new Error("Uncertified board");
  if (!Puzzle.starsAreLegal(proof.solution) || !Puzzle.validateRegions(regions, proof.solution) ||
      Puzzle.countSolutions(regions, 2) !== 1) throw new Error("Invalid or non-unique board");
  return { shape, regions, depth: proof.assumptionDepth, rating: Puzzle.scoreDifficulty(regions) };
}

const supplied = JSON.parse(fs.readFileSync(path.join(__dirname, "campaign-candidates.json"), "utf8"));
const existing = Puzzle.SHAPE_BANK_COMPACT.slice(1).map(shape => certify(decode(shape)));
const requiredShapes = new Set(supplied.map(candidate => candidate.shape));
// Preserve previously imported designs too. Otherwise adding a deeper tier
// could evict a curated shallow board, and the next rebuild would add it back.
existing.forEach(row => { row.imported = requiredShapes.has(row.shape); });
const seen = new Set(existing.map(row => row.shape));
const additions = new Map();
for (const candidate of supplied) {
  const row = certify(decode(candidate.shape));
  if (row.depth !== candidate.depth) throw new Error("Candidate depth changed: " + candidate.shape);
  if (seen.has(row.shape)) continue;
  seen.add(row.shape);
  const n = row.regions.length;
  if (!additions.has(n)) additions.set(n, []);
  additions.get(n).push(row);
}

const bank = [""];
for (const chapter of Puzzle.CHAPTERS) {
  const rows = existing.filter(row => row.regions.length === chapter.n);
  const extra = additions.get(chapter.n) || [];
  // Replace shallow tail candidates while keeping the introductory boards,
  // exact chapter lengths, and a unique shape per board.
  // Keep 9x9 workload distinctions that the displayed integer score rounds away.
  const compare = (a, b) => a.depth - b.depth ||
    (chapter.n === 9 ? a.rating.orderScore - b.rating.orderScore : a.rating.score - b.rating.score) ||
    a.rating.reasoning.nodes - b.rating.reasoning.nodes || a.shape.localeCompare(b.shape);
  rows.sort(compare);
  for (const row of extra) {
    let replace = -1;
    rows.forEach((old, i) => { if (!old.imported && old.depth < row.depth) replace = i; });
    if (replace < 0) throw new Error("No shallower board to replace in " + chapter.label);
    rows.splice(replace, 1);
    row.imported = true;
    rows.push(row);
  }
  rows.sort(compare);
  if (rows.length !== chapter.to - chapter.from + 1) throw new Error("Chapter length changed");
  const histogram = {};
  rows.forEach(row => { histogram[row.depth] = (histogram[row.depth] || 0) + 1; bank.push(row.shape); });
  console.log(chapter.label, JSON.stringify(histogram));
}
if (bank.length !== 1000 || new Set(bank).size !== 1000) throw new Error("Duplicate or missing shape");
for (const shape of requiredShapes) {
  if (!bank.includes(shape)) throw new Error("Required design was evicted: " + shape);
}

const file = path.join(__dirname, "puzzle.js");
const original = fs.readFileSync(file, "utf8");
for (const marker of ["SHAPE_BANK", "CAMPAIGN_SOURCE"]) {
  if (!original.includes("/* <" + marker + "> */") || !original.includes("/* </" + marker + "> */")) {
    throw new Error("Missing bank marker: " + marker);
  }
}
const next = original.replace(
  /\/\* <SHAPE_BANK> \*\/[\s\S]*?\/\* <\/SHAPE_BANK> \*\//,
  "/* <SHAPE_BANK> */\n  var SHAPE_BANK_COMPACT = " + JSON.stringify(bank) + ";\n  /* </SHAPE_BANK> */"
).replace(
  /\/\* <CAMPAIGN_SOURCE> \*\/[\s\S]*?\/\* <\/CAMPAIGN_SOURCE> \*\//,
  "/* <CAMPAIGN_SOURCE> */\n  var CAMPAIGN_SOURCE = " +
    JSON.stringify(Array.from({ length: 1000 }, (_, i) => i)) + ";\n  /* </CAMPAIGN_SOURCE> */"
);
if (!next.includes(JSON.stringify(bank))) throw new Error("Bank marker missing");
fs.writeFileSync(file, next);
console.log("Saved verified campaign. Run node audit-uniqueness.js and node test-reasoning.js.");
