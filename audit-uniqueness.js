const Puzzle = require("./puzzle.js");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const bank = Puzzle.SHAPE_BANK_COMPACT;
assert(bank && bank.length === Puzzle.TOTAL_LEVELS + 1, "形狀庫長度必須為 1000");
assert(bank[0] === "", "形狀庫第 0 項應為空");

const bySize = {};
Puzzle.CHAPTERS.forEach(function (ch) {
  bySize[ch.n] = {};
});

for (let lv = 1; lv <= Puzzle.TOTAL_LEVELS; lv++) {
  const compact = bank[lv];
  assert(compact && compact.indexOf(",") === -1, "形狀庫格式錯誤: " + lv);
  const spec = Puzzle.levelSpec(lv);
  const hit = bySize[spec.n][compact];
  assert(!hit, "形狀庫重複: 第 " + lv + " 關與第 " + hit + " 關");
  bySize[spec.n][compact] = lv;
}

Puzzle.CHAPTERS.forEach(function (ch) {
  const span = ch.to - ch.from + 1;
  const unique = Object.keys(bySize[ch.n]).length;
  assert(unique === span, ch.label + " 形狀庫未全數獨一: " + unique + "/" + span);
  console.log("bank", ch.label, ch.n + "x" + ch.n, unique + "/" + span, "OK");
});

function packed(p) {
  return Puzzle.compactShapeKey(Puzzle.canonicalShapeKey(p.regions));
}

const jumps = [1, 5, 6, 120, 250, 251, 360, 450, 451, 550, 650, 651, 685, 752, 820, 821, 910, 999];
jumps.forEach(function (lv) {
  delete require.cache[require.resolve("./puzzle.js")];
  const Fresh = require("./puzzle.js");
  const p = Fresh.generateLevel(lv);
  const got = Fresh.compactShapeKey(Fresh.canonicalShapeKey(p.regions));
  const source = Fresh.campaignSource(lv);
  assert(got === Fresh.SHAPE_BANK_COMPACT[source], "跳關後形狀與形狀庫不符: " + lv);
  console.log("jump", lv, "OK");
});

const t0 = Date.now();
const seen = {};
for (let lv = 1; lv <= Puzzle.TOTAL_LEVELS; lv++) {
  const p = Puzzle.generateLevel(lv);
  const compact = packed(p);
  const source = Puzzle.campaignSource(lv);
  assert(compact === bank[source], "第 " + lv + " 關與形狀庫不符");
  const spec = Puzzle.levelSpec(lv);
  const id = spec.n + ":" + compact;
  assert(!seen[id], "實關重複: 第 " + lv + " 關與第 " + seen[id] + " 關");
  seen[id] = lv;
  if (lv > spec.from) {
    const prev = Puzzle.generateLevel(lv - 1);
    assert(
      p.difficulty + 0.01 >= prev.difficulty,
      "章內難度應由低到高: 第 " + (lv - 1) + " 關 " + prev.difficulty + " > 第 " + lv + " 關 " + p.difficulty
    );
  }
  if (lv % 100 === 0 || lv === Puzzle.TOTAL_LEVELS) {
    console.log("verify", lv + "/" + Puzzle.TOTAL_LEVELS, Date.now() - t0 + "ms");
  }
}

console.log("all 999 unique and match bank in", Date.now() - t0, "ms");
