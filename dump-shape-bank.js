const fs = require("fs");
const path = require("path");
const Puzzle = require("./puzzle.js");

function compact(regions) {
  return Puzzle.compactShapeKey(Puzzle.canonicalShapeKey(regions));
}

const bank = [""];
const bySize = {};
const t0 = Date.now();

for (let lv = 1; lv <= Puzzle.TOTAL_LEVELS; lv++) {
  const p = Puzzle.generateSourceLevel(lv);
  const key = Puzzle.canonicalShapeKey(p.regions);
  const packed = compact(p.regions);
  bank[lv] = packed;
  if (!bySize[p.n]) bySize[p.n] = {};
  if (bySize[p.n][key]) {
    throw new Error("dump 時發現重複: " + bySize[p.n][key] + " <-> " + lv);
  }
  bySize[p.n][key] = lv;
  if (lv % 100 === 0 || lv === Puzzle.TOTAL_LEVELS) {
    console.log("dump", lv + "/" + Puzzle.TOTAL_LEVELS, Date.now() - t0 + "ms");
  }
}

const file = path.join(__dirname, "puzzle.js");
const src = fs.readFileSync(file, "utf8");
const marker = /\/\* <SHAPE_BANK> \*\/[\s\S]*?\/\* <\/SHAPE_BANK> \*\//;
if (!marker.test(src)) throw new Error("找不到 SHAPE_BANK 標記");
const next = src.replace(
  marker,
  "/* <SHAPE_BANK> */\n  var SHAPE_BANK_COMPACT = " + JSON.stringify(bank) + ";\n  /* </SHAPE_BANK> */"
);
fs.writeFileSync(file, next);
console.log("wrote bank", bank.length - 1, "keys", Buffer.byteLength(JSON.stringify(bank)) + " bytes");
