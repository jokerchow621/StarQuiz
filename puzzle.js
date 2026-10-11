(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) root.Puzzle = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var Reasoning = typeof module === "object" && module.exports
    ? require("./reasoning.js") : root.StarReasoning;
  var reasoningCache = new Map();

  function analyzeReasoning(regions, options) {
    // Canonicalize effort measurements as well as depth so that a rotation,
    // reflection or region-label change cannot change a difficulty score.
    var shape = canonicalShapeKey(regions);
    if (!options && reasoningCache.has(shape)) return reasoningCache.get(shape);
    var canonical = shape.split("/").map(function (row) {
      return row.split(",").map(Number);
    });
    var result = Reasoning.analyze(canonical, options);
    var summary = {
      model: result.model,
      complete: result.complete,
      assumptionDepth: result.assumptionDepth,
      lowerBound: result.lowerBound,
      nodes: result.nodes,
      layers: result.layers,
      limitReached: !!result.limitReached,
      contradiction: !!result.contradiction,
    };
    if (!options && summary.complete) reasoningCache.set(shape, summary);
    return summary;
  }

  var DIRS4 = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function key(r, c) {
    return r + "," + c;
  }

  function inBounds(n, r, c) {
    return r >= 0 && c >= 0 && r < n && c < n;
  }

  function cloneRegions(regions) {
    return regions.map(function (row) {
      return row.slice();
    });
  }

  function generateStarPlacement(n, rng) {
    rng = rng || Math.random;
    var cols = new Array(n);
    var used = new Array(n);
    for (var i = 0; i < n; i++) used[i] = false;

    function dfs(row) {
      if (row === n) return true;
      var order = shuffle(
        Array.from({ length: n }, function (_, idx) {
          return idx;
        }),
        rng
      );
      for (var k = 0; k < order.length; k++) {
        var col = order[k];
        if (used[col]) continue;
        if (row > 0 && Math.abs(cols[row - 1] - col) < 2) continue;
        used[col] = true;
        cols[row] = col;
        if (dfs(row + 1)) return true;
        used[col] = false;
      }
      return false;
    }

    return dfs(0) ? cols : null;
  }

  function growRegions(n, stars, rng, singletonIds) {
    rng = rng || Math.random;
    var frozen = {};
    if (singletonIds) {
      for (var s = 0; s < singletonIds.length; s++) frozen[singletonIds[s]] = true;
    }
    var regions = Array.from({ length: n }, function () {
      return Array(n).fill(-1);
    });
    var cells = [];
    var frontiers = [];
    var growers = [];

    for (var id = 0; id < n; id++) {
      regions[id][stars[id]] = id;
      cells[id] = [[id, stars[id]]];
      frontiers[id] = [];
      if (!frozen[id]) growers.push(id);
    }
    if (growers.length === 0) return n === 1 ? regions : null;

    function addFrontier(regionId, r, c) {
      var order = shuffle(DIRS4.slice(), rng);
      for (var d = 0; d < order.length; d++) {
        var nr = r + order[d][0];
        var nc = c + order[d][1];
        if (!inBounds(n, nr, nc) || regions[nr][nc] !== -1) continue;
        var exists = false;
        for (var i = 0; i < frontiers[regionId].length; i++) {
          if (frontiers[regionId][i][0] === nr && frontiers[regionId][i][1] === nc) {
            exists = true;
            break;
          }
        }
        if (!exists) frontiers[regionId].push([nr, nc]);
      }
    }

    for (id = 0; id < growers.length; id++) {
      addFrontier(growers[id], growers[id], stars[growers[id]]);
    }

    function pruneFrontier(regionId) {
      frontiers[regionId] = frontiers[regionId].filter(function (cell) {
        return regions[cell[0]][cell[1]] === -1;
      });
    }

    function claim(regionId, cell) {
      regions[cell[0]][cell[1]] = regionId;
      cells[regionId].push(cell);
      addFrontier(regionId, cell[0], cell[1]);
    }

    var walkBudget = n * n;
    for (var step = 0; step < walkBudget; step++) {
      id = growers[step % growers.length];
      pruneFrontier(id);
      if (frontiers[id].length === 0) continue;
      var pickIdx =
        rng() < 0.78
          ? frontiers[id].length - 1
          : Math.floor(rng() * frontiers[id].length);
      var walkCell = frontiers[id].splice(pickIdx, 1)[0];
      if (regions[walkCell[0]][walkCell[1]] !== -1) continue;
      claim(id, walkCell);
    }

    var remaining = 0;
    for (var rr = 0; rr < n; rr++) {
      for (var cc = 0; cc < n; cc++) {
        if (regions[rr][cc] === -1) remaining++;
      }
    }

    var guard = n * n + 8;
    while (remaining > 0 && guard-- > 0) {
      var options = [];
      for (id = 0; id < n; id++) {
        pruneFrontier(id);
        if (frontiers[id].length) options.push(id);
      }
      if (options.length === 0) break;
      var chosen = options[Math.floor(rng() * options.length)];
      pruneFrontier(chosen);
      if (frontiers[chosen].length === 0) continue;
      var fillCell = frontiers[chosen].splice(
        rng() < 0.7 ? frontiers[chosen].length - 1 : Math.floor(rng() * frontiers[chosen].length),
        1
      )[0];
      if (regions[fillCell[0]][fillCell[1]] !== -1) continue;
      claim(chosen, fillCell);
      remaining--;
    }

    return remaining === 0 ? regions : null;
  }

  function isFullyFilled(regions) {
    var n = regions.length;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (regions[r][c] < 0 || regions[r][c] >= n) return false;
      }
    }
    return true;
  }

  function regionCells(regions) {
    var n = regions.length;
    var groups = Array.from({ length: n }, function () {
      return [];
    });
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        groups[regions[r][c]].push([r, c]);
      }
    }
    return groups;
  }

  function isConnected(cells) {
    if (cells.length === 0) return false;
    var set = {};
    for (var i = 0; i < cells.length; i++) set[key(cells[i][0], cells[i][1])] = true;
    var seen = {};
    var stack = [cells[0]];
    seen[key(cells[0][0], cells[0][1])] = true;
    var count = 1;
    while (stack.length) {
      var cur = stack.pop();
      for (var d = 0; d < DIRS4.length; d++) {
        var nr = cur[0] + DIRS4[d][0];
        var nc = cur[1] + DIRS4[d][1];
        var k = key(nr, nc);
        if (set[k] && !seen[k]) {
          seen[k] = true;
          count++;
          stack.push([nr, nc]);
        }
      }
    }
    return count === cells.length;
  }

  function validateRegions(regions, stars) {
    if (!isFullyFilled(regions)) return false;
    var n = regions.length;
    var groups = regionCells(regions);
    for (var id = 0; id < n; id++) {
      if (!isConnected(groups[id])) return false;
      var starCount = 0;
      for (var i = 0; i < groups[id].length; i++) {
        var r = groups[id][i][0];
        var c = groups[id][i][1];
        if (stars[r] === c) starCount++;
      }
      if (starCount !== 1) return false;
    }
    return true;
  }

  function starsAreLegal(stars) {
    var n = stars.length;
    var used = {};
    for (var r = 0; r < n; r++) {
      var c = stars[r];
      if (c < 0 || c >= n || used[c]) return false;
      used[c] = true;
      if (r > 0 && Math.abs(stars[r - 1] - c) < 2) return false;
    }
    return true;
  }

  function searchSolutions(regions, limit, skipStars) {
    limit = limit || 2;
    var n = regions.length;
    var usedCol = new Array(n);
    var usedRegion = new Array(n);
    var starCol = new Array(n);
    var found = [];

    for (var i = 0; i < n; i++) {
      usedCol[i] = false;
      usedRegion[i] = false;
    }

    function sameAsSkip() {
      if (!skipStars) return false;
      for (var r = 0; r < n; r++) {
        if (starCol[r] !== skipStars[r]) return false;
      }
      return true;
    }

    function dfs(row) {
      if (found.length >= limit) return;
      if (row === n) {
        if (!sameAsSkip()) found.push(starCol.slice());
        return;
      }
      for (var col = 0; col < n; col++) {
        if (usedCol[col]) continue;
        var region = regions[row][col];
        if (usedRegion[region]) continue;
        if (row > 0 && Math.abs(starCol[row - 1] - col) < 2) continue;
        usedCol[col] = true;
        usedRegion[region] = true;
        starCol[row] = col;
        dfs(row + 1);
        usedCol[col] = false;
        usedRegion[region] = false;
      }
    }

    dfs(0);
    return found;
  }

  function countSolutions(regions, limit) {
    return searchSolutions(regions, limit).length;
  }

  function findSolution(regions) {
    var found = searchSolutions(regions, 1);
    return found.length ? found[0] : null;
  }

  function findAnotherSolution(regions, official) {
    var found = searchSolutions(regions, 1, official);
    return found.length ? found[0] : null;
  }

  function starBlockSet(stars, exceptRegion, regions) {
    var blocked = {};
    for (var r = 0; r < stars.length; r++) {
      var c = stars[r];
      if (exceptRegion != null && regions[r][c] === exceptRegion) continue;
      blocked[key(r, c)] = true;
    }
    return blocked;
  }

  function pathToRegion(regions, startR, startC, targetId, blocked, rng) {
    var n = regions.length;
    if (regions[startR][startC] === targetId) return [];

    var queue = [[startR, startC]];
    var prev = {};
    prev[key(startR, startC)] = null;

    while (queue.length) {
      var cur = queue.shift();
      var dirs = shuffle(DIRS4.slice(), rng);
      for (var d = 0; d < dirs.length; d++) {
        var nr = cur[0] + dirs[d][0];
        var nc = cur[1] + dirs[d][1];
        if (!inBounds(n, nr, nc)) continue;
        var k = key(nr, nc);
        if (Object.prototype.hasOwnProperty.call(prev, k)) continue;
        if (blocked[k] && regions[nr][nc] !== targetId) continue;
        prev[k] = cur;
        if (regions[nr][nc] === targetId) {
          var path = [];
          var node = cur;
          while (node) {
            path.push(node);
            node = prev[key(node[0], node[1])];
          }
          return path;
        }
        queue.push([nr, nc]);
      }
    }
    return null;
  }

  function applyPath(regions, path, targetId) {
    var next = cloneRegions(regions);
    for (var i = 0; i < path.length; i++) {
      next[path[i][0]][path[i][1]] = targetId;
    }
    return next;
  }

  function enforceUniqueness(regions, stars, rng) {
    rng = rng || Math.random;
    regions = cloneRegions(regions);
    var n = stars.length;

    for (var iter = 0; iter < 20; iter++) {
      var alt = findAnotherSolution(regions, stars);
      if (!alt) return regions;

      var diffs = [];
      for (var r = 0; r < n; r++) {
        if (alt[r] !== stars[r]) diffs.push(r);
      }
      if (diffs.length < 2) return null;
      shuffle(diffs, rng);

      var success = false;
      pairLoop: for (var i = 0; i < diffs.length; i++) {
        for (var j = i + 1; j < diffs.length; j++) {
          var r1 = diffs[i];
          var r2 = diffs[j];
          var targets = [regions[r1][stars[r1]], regions[r2][stars[r2]]];
          for (var t = 0; t < targets.length; t++) {
            var targetId = targets[t];
            var blocked = starBlockSet(stars, targetId, regions);
            var p1 = pathToRegion(regions, r1, alt[r1], targetId, blocked, rng);
            var p2 = pathToRegion(regions, r2, alt[r2], targetId, blocked, rng);
            if (!p1 || !p2) continue;
            var next = applyPath(applyPath(regions, p1, targetId), p2, targetId);
            if (!validateRegions(next, stars)) continue;
            regions = next;
            success = true;
            break pairLoop;
          }
        }
      }
      if (!success) return null;
    }

    return findAnotherSolution(regions, stars) ? null : regions;
  }

  var FALLBACKS = {
    5: [
      { regions: [[2,2,0,2,2],[1,2,2,2,2],[1,2,2,2,4],[1,3,3,3,4],[1,3,3,3,4]], stars: [2,0,3,1,4] },
      { regions: [[0,0,3,4,1],[0,3,3,4,1],[0,3,2,4,4],[3,3,3,3,4],[3,4,4,4,4]], stars: [1,4,2,0,3] },
      { regions: [[2,0,0,1,1],[2,0,0,1,1],[2,2,0,0,1],[4,2,2,3,3],[4,2,3,3,3]], stars: [2,4,1,3,0] },
      { regions: [[0,0,0,0,1],[0,1,1,1,1],[2,2,2,4,4],[3,3,2,4,4],[4,4,4,4,4]], stars: [1,4,2,0,3] },
      { regions: [[0,0,0,0,0],[0,3,3,1,1],[0,2,3,1,1],[0,3,3,3,1],[4,3,3,3,1]], stars: [2,4,1,3,0] },
      { regions: [[4,0,0,0,1],[4,2,0,1,1],[4,2,2,2,2],[4,2,3,3,3],[4,4,4,4,4]], stars: [2,4,1,3,0] },
      { regions: [[1,0,0,0,0],[1,1,1,0,0],[2,2,0,0,0],[4,3,3,3,0],[4,4,3,3,3]], stars: [4,2,0,3,1] },
      { regions: [[1,1,1,0,0],[1,0,0,0,0],[1,1,2,2,3],[1,1,4,2,3],[4,4,4,2,3]], stars: [3,0,2,4,1] },
      { regions: [[2,2,0,0,0],[2,0,0,0,1],[2,4,4,0,1],[2,2,4,3,3],[4,4,4,3,3]], stars: [2,4,0,3,1] },
      { regions: [[0,0,1,1,1],[0,0,3,1,1],[0,2,3,3,3],[4,3,3,3,3],[4,4,4,3,3]], stars: [0,3,1,4,2] },
      { regions: [[0,0,0,0,0],[0,0,2,2,1],[3,2,2,2,1],[3,4,4,2,2],[3,3,4,4,4]], stars: [1,4,2,0,3] },
      { regions: [[0,4,2,2,2],[0,4,1,2,2],[0,4,4,2,2],[0,3,4,2,4],[3,3,4,4,4]], stars: [0,2,4,1,3] },
    ],
    6: [
      { regions: [[0,0,0,0,1,1],[2,1,1,1,1,1],[2,2,2,1,1,1],[3,2,2,3,3,3],[3,3,3,3,4,3],[5,5,5,4,4,4]], stars: [3,5,2,0,4,1] },
      { regions: [[0,0,0,0,0,0],[3,1,0,2,2,2],[3,0,0,5,2,4],[3,3,5,5,4,4],[3,3,5,4,4,4],[5,5,5,5,5,5]], stars: [3,1,4,0,5,2] },
      { regions: [[3,3,3,0,0,0],[2,2,3,0,0,1],[2,2,3,3,0,1],[3,3,3,3,3,4],[3,4,4,4,3,4],[5,5,5,4,4,4]], stars: [3,5,1,4,2,0] },
      { regions: [[0,0,0,0,0,3],[1,1,0,2,2,3],[3,0,0,2,2,3],[3,3,3,3,3,3],[5,4,5,5,3,3],[5,5,5,5,5,5]], stars: [2,0,3,5,1,4] },
    ],
    7: [
      { regions: [[3,3,2,2,0,0,1],[3,3,2,2,2,1,1],[3,3,2,2,2,2,2],[6,3,3,3,3,3,3],[6,6,6,5,4,4,4],[6,6,5,5,4,4,4],[6,6,6,5,4,4,4]], stars: [4,6,3,1,5,2,0] },
      { regions: [[1,1,1,0,0,0,0],[1,6,1,1,1,1,0],[6,6,3,3,1,2,0],[6,5,5,3,1,1,0],[6,4,5,5,5,5,0],[6,4,4,4,5,5,0],[6,6,4,4,4,4,4]], stars: [6,2,5,3,1,4,0] },
      { regions: [[3,0,0,1,1,1,1],[3,3,0,3,3,1,1],[2,3,3,3,3,5,5],[4,3,3,4,4,5,5],[4,4,4,4,4,4,5],[6,6,4,4,4,5,5],[6,6,6,6,6,5,5]], stars: [1,5,0,2,4,6,3] },
      { regions: [[0,0,0,0,0,0,0],[2,1,1,1,1,1,0],[2,2,2,2,2,1,0],[5,5,2,2,4,3,0],[5,2,2,4,4,3,0],[5,2,2,2,2,2,2],[5,5,6,6,6,6,2]], stars: [6,4,1,5,3,0,2] },
    ],
    8: [
      { regions: [[7,0,0,0,0,0,0,0],[7,1,1,1,0,3,0,0],[7,2,1,1,0,3,3,0],[7,1,1,1,1,1,3,0],[7,5,4,4,4,1,1,0],[7,5,5,5,4,4,1,0],[7,7,7,5,4,4,1,6],[7,7,7,7,7,4,4,4]], stars: [5,3,1,6,4,2,7,0] },
      { regions: [[7,1,0,0,0,0,0,2],[7,1,0,6,6,6,6,2],[7,1,0,6,2,2,2,2],[7,0,0,6,3,3,2,2],[7,0,4,6,3,3,2,2],[7,0,4,6,3,5,6,6],[7,7,7,6,6,6,6,7],[7,7,7,7,7,7,7,7]], stars: [6,1,7,4,2,5,3,0] },
      { regions: [[2,0,0,0,0,0,0,0],[2,2,1,1,2,0,0,0],[2,2,2,2,2,2,2,0],[2,5,3,3,3,3,3,3],[5,5,4,4,4,4,4,3],[5,4,4,3,3,3,3,3],[5,4,3,3,6,7,7,3],[4,4,7,7,7,7,3,3]], stars: [6,3,1,7,5,0,4,2] },
    ],
    9: [
      { regions: [[4,0,0,0,0,0,0,0,0],[4,4,4,4,1,3,0,3,0],[4,4,2,2,2,3,3,3,0],[4,4,2,3,3,3,5,0,0],[4,4,4,4,4,4,5,0,0],[4,4,5,5,5,5,5,0,0],[7,4,5,8,8,5,0,0,6],[7,5,5,8,5,5,0,0,0],[8,8,8,8,8,5,5,5,5]], stars: [7,4,2,5,1,6,8,0,3] },
      { regions: [[0,0,0,0,0,0,0,0,0],[4,4,2,2,2,2,1,0,0],[4,5,5,2,3,3,0,0,0],[4,4,5,5,5,3,3,3,0],[6,4,5,5,7,7,3,8,0],[6,6,8,5,5,7,3,8,0],[6,8,8,8,8,7,7,8,8],[6,6,8,8,8,8,7,7,8],[8,8,8,8,8,8,8,8,8]], stars: [8,6,3,5,1,4,0,7,2] },
      { regions: [[3,2,2,2,2,2,0,0,0],[3,1,2,2,4,2,2,2,0],[3,3,3,2,4,4,4,2,2],[3,3,3,3,4,5,4,4,5],[6,6,6,3,4,5,4,4,5],[6,6,6,3,5,5,5,5,5],[8,8,6,6,6,6,6,6,5],[8,8,6,6,6,6,7,5,5],[8,8,8,8,8,6,6,6,6]], stars: [8,1,3,0,7,5,2,6,4] },
    ],
  };

  function puzzleKey(puzzle) {
    return puzzle.regions
      .map(function (row) {
        return row.join("");
      })
      .join("/") + "|" + puzzle.stars.join(",");
  }

  function fallbackPuzzle(n, avoidKey, rng) {
    rng = rng || Math.random;
    var list = FALLBACKS[n] || FALLBACKS[5];
    var choices = list.filter(function (item) {
      return puzzleKey(item) !== avoidKey;
    });
    if (!choices.length) choices = list;
    var pick = choices[Math.floor(rng() * choices.length)];
    return {
      n: n,
      regions: cloneRegions(pick.regions),
      stars: pick.stars.slice(),
    };
  }

  function tryGenerateOnce(n) {
    var stars = generateStarPlacement(n);
    if (!stars) return null;
    var regions = growRegions(n, stars);
    if (!regions || !validateRegions(regions, stars)) return null;
    if (findAnotherSolution(regions, stars)) {
      regions = enforceUniqueness(regions, stars);
      if (!regions || findAnotherSolution(regions, stars) || !validateRegions(regions, stars)) {
        return null;
      }
    }
    return { n: n, regions: regions, stars: stars };
  }

  function generatePuzzle(n, maxAttempts) {
    maxAttempts = maxAttempts || 24;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      var puzzle = tryGenerateOnce(n);
      if (puzzle) return puzzle;
    }
    return fallbackPuzzle(n);
  }

  var TOTAL_LEVELS = 999;
  var CHAPTERS = [
    { n: 4, label: "啟蒙", from: 1, to: 5 },
    { n: 5, label: "入門", from: 6, to: 250 },
    { n: 6, label: "簡易", from: 251, to: 450 },
    { n: 7, label: "普通", from: 451, to: 650 },
    { n: 8, label: "進階", from: 651, to: 820 },
    { n: 9, label: "專家", from: 821, to: 999 },
  ];

  function createRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function levelSeed(level, attempt) {
    var x = (level * 2654435761) >>> 0;
    x ^= ((attempt || 0) + 1) * 1597334677;
    return x >>> 0;
  }

  function levelSpec(level) {
    level = Math.max(1, Math.min(TOTAL_LEVELS, level | 0));
    var chapter = CHAPTERS[CHAPTERS.length - 1];
    for (var i = 0; i < CHAPTERS.length; i++) {
      if (level >= CHAPTERS[i].from && level <= CHAPTERS[i].to) {
        chapter = CHAPTERS[i];
        break;
      }
    }
    var span = chapter.to - chapter.from + 1;
    var progress = (level - chapter.from) / Math.max(1, span - 1);
    return {
      level: level,
      n: chapter.n,
      label: chapter.label,
      from: chapter.from,
      to: chapter.to,
      progress: progress,
    };
  }

  function maxSingletons(n, progress) {
    if (n <= 4) return 3;
    if (n === 5) {
      if (progress < 0.3) return 2;
      if (progress < 0.7) return 1;
      return 0;
    }
    if (progress < 0.35) return 2;
    if (progress < 0.7) return 1;
    return 0;
  }

  function maxLeftoverStars(n, progress) {
    if (n <= 4) return 1;
    if (n >= 8 && progress < 0.28) return 3;
    if (progress < 0.28) return Math.max(1, Math.floor(n / 3));
    if (progress < 0.55) return Math.max(2, Math.floor(n / 2));
    if (progress < 0.78) return Math.max(3, Math.floor(n * 0.7));
    return n;
  }

  function countSingletons(regions) {
    var groups = regionCells(regions);
    var count = 0;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].length === 1) count++;
    }
    return count;
  }

  function desiredSingletons(n, progress, attempt) {
    var maxS = maxSingletons(n, progress);
    var minS = 0;
    if (n <= 4) minS = 1;
    else if (n === 5 && progress < 0.25) minS = 1;
    else if (n >= 6 && progress < 0.3) minS = 1;
    var target = Math.round(maxS * (1 - progress * 0.85));
    var offsets = [0, -1, 0, 1, -1, 0];
    var want = target + (offsets[attempt % offsets.length] || 0);
    return Math.min(maxS, Math.max(minS, want));
  }

  var DIFFICULTY_MAX = 100;
  var DIFFICULTY_WEIGHTS = {
    grid: 0.2,
    solving: 0.25,
    technique: 0.3,
    steps: 0.25,
  };
  var TECHNIQUE_RANK = {
    singleton: 10,
    nakedSingle: 28,
    pointing: 52,
    lookahead: 76,
    search: 94,
  };
  var TECHNIQUE_LABELS = {
    singleton: "單格區域",
    nakedSingle: "唯一格",
    pointing: "指向消去",
    lookahead: "鄰接試探",
    search: "分支搜尋",
  };

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function countRemaining(possible, placed) {
    var n = possible.length;
    var count = 0;
    var r, c;
    for (r = 0; r < n; r++) {
      if (placed[r] >= 0) continue;
      for (c = 0; c < n; c++) {
        if (possible[r][c]) count += 1;
      }
    }
    return count;
  }

  function analyzeDifficulty(regions) {
    var n = regions.length;
    var groups = regionCells(regions);
    var singleton = 0;
    var i;
    for (i = 0; i < n; i++) {
      if (groups[i].length === 1) singleton++;
    }

    var possible = Array.from({ length: n }, function () {
      return Array(n).fill(true);
    });
    var placed = Array(n).fill(-1);
    var placedCount = 0;
    var techniqueHits = {};

    function markTech(name) {
      techniqueHits[name] = (techniqueHits[name] || 0) + 1;
    }

    function eliminate(pr, pc) {
      var rr, cc, k, dr, dc, nr, nc;
      for (cc = 0; cc < n; cc++) possible[pr][cc] = false;
      for (rr = 0; rr < n; rr++) possible[rr][pc] = false;
      var rid = regions[pr][pc];
      for (k = 0; k < groups[rid].length; k++) {
        possible[groups[rid][k][0]][groups[rid][k][1]] = false;
      }
      for (dr = -1; dr <= 1; dr++) {
        for (dc = -1; dc <= 1; dc++) {
          nr = pr + dr;
          nc = pc + dc;
          if (inBounds(n, nr, nc)) possible[nr][nc] = false;
        }
      }
      placed[pr] = pc;
    }

    function collectForced() {
      var forced = [];
      var seen = {};
      function add(r, c) {
        var k = r + "," + c;
        if (placed[r] >= 0 || seen[k] || !possible[r][c]) return;
        seen[k] = true;
        forced.push([r, c]);
      }
      var r, c, id, spots, k, cell, has;
      for (r = 0; r < n; r++) {
        if (placed[r] >= 0) continue;
        spots = [];
        for (c = 0; c < n; c++) if (possible[r][c]) spots.push(c);
        if (spots.length === 1) add(r, spots[0]);
      }
      for (c = 0; c < n; c++) {
        spots = [];
        has = false;
        for (r = 0; r < n; r++) {
          if (placed[r] === c) has = true;
          if (possible[r][c]) spots.push(r);
        }
        if (!has && spots.length === 1) add(spots[0], c);
      }
      for (id = 0; id < n; id++) {
        spots = [];
        has = false;
        for (k = 0; k < groups[id].length; k++) {
          cell = groups[id][k];
          if (placed[cell[0]] === cell[1]) has = true;
          if (possible[cell[0]][cell[1]]) spots.push(cell);
        }
        if (!has && spots.length === 1) add(spots[0][0], spots[0][1]);
      }
      return forced;
    }

    function applySingles() {
      var forced = collectForced();
      if (!forced.length) return 0;
      var placedNow = 0;
      for (i = 0; i < forced.length; i++) {
        var fr = forced[i][0];
        var fc = forced[i][1];
        if (placed[fr] >= 0) continue;
        if (groups[regions[fr][fc]].length === 1) markTech("singleton");
        else markTech("nakedSingle");
        eliminate(fr, fc);
        placedCount += 1;
        placedNow += 1;
      }
      return placedNow;
    }

    function applyPointing() {
      var changed = false;
      var id, k, cell, r, c, spots, sameRow, sameCol, rid, used;
      for (id = 0; id < n; id++) {
        used = false;
        spots = [];
        for (k = 0; k < groups[id].length; k++) {
          cell = groups[id][k];
          if (placed[cell[0]] === cell[1]) used = true;
          if (possible[cell[0]][cell[1]]) spots.push(cell);
        }
        if (used || spots.length < 2) continue;
        sameRow = spots[0][0];
        sameCol = spots[0][1];
        for (k = 1; k < spots.length; k++) {
          if (spots[k][0] !== sameRow) sameRow = -1;
          if (spots[k][1] !== sameCol) sameCol = -1;
        }
        if (sameRow >= 0) {
          for (c = 0; c < n; c++) {
            if (!possible[sameRow][c] || regions[sameRow][c] === id) continue;
            possible[sameRow][c] = false;
            changed = true;
          }
        }
        if (sameCol >= 0) {
          for (r = 0; r < n; r++) {
            if (!possible[r][sameCol] || regions[r][sameCol] === id) continue;
            possible[r][sameCol] = false;
            changed = true;
          }
        }
      }
      for (r = 0; r < n; r++) {
        if (placed[r] >= 0) continue;
        spots = [];
        for (c = 0; c < n; c++) if (possible[r][c]) spots.push(c);
        if (spots.length < 2) continue;
        rid = regions[r][spots[0]];
        for (k = 1; k < spots.length; k++) {
          if (regions[r][spots[k]] !== rid) {
            rid = -1;
            break;
          }
        }
        if (rid < 0) continue;
        for (k = 0; k < groups[rid].length; k++) {
          cell = groups[rid][k];
          if (cell[0] === r || !possible[cell[0]][cell[1]]) continue;
          possible[cell[0]][cell[1]] = false;
          changed = true;
        }
      }
      for (c = 0; c < n; c++) {
        used = false;
        spots = [];
        for (r = 0; r < n; r++) {
          if (placed[r] === c) used = true;
          if (possible[r][c]) spots.push(r);
        }
        if (used || spots.length < 2) continue;
        rid = regions[spots[0]][c];
        for (k = 1; k < spots.length; k++) {
          if (regions[spots[k]][c] !== rid) {
            rid = -1;
            break;
          }
        }
        if (rid < 0) continue;
        for (k = 0; k < groups[rid].length; k++) {
          cell = groups[rid][k];
          if (cell[1] === c || !possible[cell[0]][cell[1]]) continue;
          possible[cell[0]][cell[1]] = false;
          changed = true;
        }
      }
      if (changed) markTech("pointing");
      return changed;
    }

    function placementStarves(pr, pc) {
      var rid = regions[pr][pc];
      var r, c, id, k, cell, has;
      for (r = 0; r < n; r++) {
        if (r === pr || placed[r] >= 0) continue;
        has = false;
        for (c = 0; c < n; c++) {
          if (!possible[r][c] || c === pc || regions[r][c] === rid) continue;
          if (Math.abs(r - pr) <= 1 && Math.abs(c - pc) <= 1) continue;
          has = true;
          break;
        }
        if (!has) return true;
      }
      for (c = 0; c < n; c++) {
        if (c === pc) continue;
        has = false;
        for (r = 0; r < n; r++) {
          if (placed[r] === c) {
            has = true;
            break;
          }
          if (!possible[r][c] || r === pr || regions[r][c] === rid) continue;
          if (Math.abs(r - pr) <= 1 && Math.abs(c - pc) <= 1) continue;
          has = true;
          break;
        }
        if (!has) return true;
      }
      for (id = 0; id < n; id++) {
        if (id === rid) continue;
        has = false;
        for (k = 0; k < groups[id].length; k++) {
          cell = groups[id][k];
          r = cell[0];
          c = cell[1];
          if (placed[r] === c) {
            has = true;
            break;
          }
          if (!possible[r][c] || r === pr || c === pc) continue;
          if (Math.abs(r - pr) <= 1 && Math.abs(c - pc) <= 1) continue;
          has = true;
          break;
        }
        if (!has) return true;
      }
      return false;
    }

    function applyLookahead() {
      var changed = false;
      var r, c;
      for (r = 0; r < n; r++) {
        if (placed[r] >= 0) continue;
        for (c = 0; c < n; c++) {
          if (!possible[r][c]) continue;
          if (!placementStarves(r, c)) continue;
          possible[r][c] = false;
          changed = true;
        }
      }
      if (changed) markTech("lookahead");
      return changed;
    }

    var waves = 0;
    var firstWaveForced = 0;
    var logicSteps = 0;
    var placedNow;

    while (placedCount < n) {
      placedNow = applySingles();
      if (placedNow) {
        waves += 1;
        logicSteps += 1;
        if (waves === 1) firstWaveForced = placedNow;
        continue;
      }
      break;
    }

    var leftoverStars = n - placedCount;
    var leftoverCands = countRemaining(possible, placed);

    while (placedCount < n) {
      placedNow = applySingles();
      if (placedNow) {
        waves += 1;
        logicSteps += 1;
        continue;
      }
      if (applyPointing()) {
        logicSteps += 1;
        continue;
      }
      if (applyLookahead()) {
        logicSteps += 1;
        continue;
      }
      break;
    }

    var logicLeftover = n - placedCount;
    if (logicLeftover > 0) markTech("search");

    var techniques = Object.keys(techniqueHits);
    var techniqueLabels = techniques.map(function (name) {
      return TECHNIQUE_LABELS[name] || name;
    });
    var hardest = "singleton";
    var hardestRank = 0;
    for (i = 0; i < techniques.length; i++) {
      var rank = TECHNIQUE_RANK[techniques[i]] || 0;
      if (rank >= hardestRank) {
        hardestRank = rank;
        hardest = techniques[i];
      }
    }

    return {
      n: n,
      singleton: singleton,
      leftoverStars: leftoverStars,
      leftoverCands: leftoverCands,
      firstWaveForced: firstWaveForced,
      waves: waves,
      logicSteps: logicSteps,
      logicLeftover: logicLeftover,
      techniques: techniques,
      techniqueLabels: techniqueLabels,
      techniqueHits: techniqueHits,
      hardestTechnique: hardest,
      hardestRank: hardestRank,
    };
  }

  function partGrid(n) {
    return clamp(((n - 4) / 5) * 95 + 5, 5, DIFFICULTY_MAX);
  }

  function partTechnique(info) {
    var variety = Math.max(0, info.techniques.length - 1) * 5;
    return clamp(info.hardestRank + Math.min(12, variety), 8, DIFFICULTY_MAX);
  }

  function partSteps(info) {
    var n = info.n;
    var chain = clamp(info.logicSteps / 12, 0, 1);
    var depth = clamp(info.waves / 8, 0, 1);
    var unfinished = clamp(info.leftoverStars / Math.max(2, n * 0.5), 0, 1);
    var advanced = clamp((info.logicSteps - info.waves) / Math.max(1, n * 0.5), 0, 1);
    return clamp(
      8 +
        92 *
          (0.22 * chain +
            0.12 * depth +
            0.48 * unfinished +
            0.18 * advanced),
      8,
      DIFFICULTY_MAX
    );
  }

  function partSolving(info) {
    var n = info.n;
    var immediate = 1 - info.firstWaveForced / n;
    var search = clamp(info.leftoverStars / Math.max(2, n * 0.5), 0, 1);
    var deepSearch = clamp(info.logicLeftover / Math.max(1, n * 0.4), 0, 1);
    var branch =
      info.leftoverStars > 0
        ? clamp(info.leftoverCands / (n * Math.max(2, info.leftoverStars)), 0, 1)
        : 0;
    var geometry = 1 - info.singleton / n;
    return clamp(
      8 +
        92 *
          (0.18 * immediate +
            0.34 * search +
            0.22 * deepSearch +
            0.14 * branch +
            0.12 * geometry),
      8,
      DIFFICULTY_MAX
    );
  }

  function scoreDifficulty(regions, stars) {
    regions = canonicalShapeKey(regions).split("/").map(function (row) {
      return row.split(",").map(Number);
    });
    var info = analyzeDifficulty(regions);
    var parts = {
      grid: partGrid(info.n),
      solving: partSolving(info),
      technique: partTechnique(info),
      steps: partSteps(info),
    };
    var weighted = {
      grid: parts.grid * DIFFICULTY_WEIGHTS.grid,
      solving: parts.solving * DIFFICULTY_WEIGHTS.solving,
      technique: parts.technique * DIFFICULTY_WEIGHTS.technique,
      steps: parts.steps * DIFFICULTY_WEIGHTS.steps,
    };
    var raw = weighted.grid + weighted.solving + weighted.technique + weighted.steps;
    var logicalScore = Math.round(clamp(raw, 1, DIFFICULTY_MAX));
    var reasoning = analyzeReasoning(regions);
    if (!reasoning.complete || reasoning.assumptionDepth === null) {
      throw new Error("無法確認題目的假設深度；不可將未完成分析標成高難度");
    }
    // Disjoint bands make actual nesting dominate size and workload. The old
    // heuristic remains available as logicalScore, not as a depth certificate.
    var bands = [[5, 29], [30, 49], [50, 69], [70, 84], [85, 94], [95, 100]];
    var band = bands[reasoning.assumptionDepth];
    var effort = clamp(Math.log2(1 + reasoning.nodes) / 18, 0, 1);
    var within = 0.65 * effort + 0.2 * logicalScore / 100 + 0.15 * parts.grid / 100;
    var score = Math.round(band[0] + (band[1] - band[0]) * within);
    return {
      score: score,
      // Preserve within-band precision for campaign ordering.
      orderScore: band[0] + (band[1] - band[0]) * within,
      logicalScore: logicalScore,
      assumptionDepth: reasoning.assumptionDepth,
      reasoning: reasoning,
      maxScore: DIFFICULTY_MAX,
      weights: DIFFICULTY_WEIGHTS,
      parts: parts,
      weighted: weighted,
      techniques: info.techniques,
      techniqueLabels: info.techniqueLabels,
      techniqueHits: info.techniqueHits,
      hardestTechnique: info.hardestTechnique,
      logicSteps: info.logicSteps,
      logicLeftover: info.logicLeftover,
      singleton: info.singleton,
      leftoverStars: info.leftoverStars,
      leftoverCands: info.leftoverCands,
      firstWaveForced: info.firstWaveForced,
      waves: info.waves,
    };
  }

  function attachRating(puzzle, rated) {
    rated = rated || scoreDifficulty(puzzle.regions, puzzle.stars);
    puzzle.difficulty = rated.score;
    puzzle.rating = rated;
    return puzzle;
  }

  function targetDifficulty(spec) {
    var n = spec.n;
    var easy = 24;
    var hard = 50;
    if (n <= 4) {
      easy = 18;
      hard = 34;
    } else if (n === 5) {
      easy = 24;
      hard = 50;
    } else if (n === 6) {
      easy = 32;
      hard = 58;
    } else if (n === 7) {
      easy = 44;
      hard = 72;
    } else if (n === 8) {
      easy = 50;
      hard = 78;
    } else {
      easy = 58;
      hard = 90;
    }
    var t = spec.progress;
    t = t * t * (3 - 2 * t);
    return easy + (hard - easy) * t;
  }

  function rotatePuzzle(puzzle) {
    var n = puzzle.n;
    var regions = Array.from({ length: n }, function () {
      return Array(n);
    });
    var stars = Array(n);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        regions[c][n - 1 - r] = puzzle.regions[r][c];
      }
      stars[puzzle.stars[r]] = n - 1 - r;
    }
    return { n: n, regions: regions, stars: stars, palette: puzzle.palette, level: puzzle.level };
  }

  function flipPuzzle(puzzle) {
    var n = puzzle.n;
    var regions = Array.from({ length: n }, function () {
      return Array(n);
    });
    var stars = Array(n);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        regions[r][n - 1 - c] = puzzle.regions[r][c];
      }
      stars[r] = n - 1 - puzzle.stars[r];
    }
    return { n: n, regions: regions, stars: stars, palette: puzzle.palette, level: puzzle.level };
  }

  function nibblePuzzle(puzzle, level, minWant, salt) {
    var regions = cloneRegions(puzzle.regions);
    var stars = puzzle.stars;
    var n = puzzle.n;
    var x = (Math.imul(level ^ ((salt || 0) * 1597334677), 747796405) + 2891336453) >>> 0;
    var progress = levelSpec(level).progress;
      var want = progress < 0.25 ? 0 : progress < 0.55 ? 2 : 4 + (level % 3);
    if (n >= 5) want = Math.max(want, 1 + (level % 3));
    if (n >= 7) want = Math.max(want, 2 + (level % 3));
    if (minWant) want = Math.max(want, minWant);
    var applied = 0;
    var guard = n * n * 2;
    while (applied < want && guard-- > 0) {
      var cands = [];
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (stars[r] === c) continue;
          var id = regions[r][c];
          for (var d = 0; d < DIRS4.length; d++) {
            var nr = r + DIRS4[d][0];
            var nc = c + DIRS4[d][1];
            if (!inBounds(n, nr, nc) || regions[nr][nc] === id) continue;
            cands.push({ r: r, c: c, to: regions[nr][nc] });
          }
        }
      }
      if (!cands.length) break;
      var pick = cands[x % cands.length];
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      var fromId = regions[pick.r][pick.c];
      var fromSize = 0;
      var rr, cc;
      for (rr = 0; rr < n; rr++) {
        for (cc = 0; cc < n; cc++) {
          if (regions[rr][cc] === fromId) fromSize++;
        }
      }
      if (fromSize <= 2) continue;
      var next = cloneRegions(regions);
      next[pick.r][pick.c] = pick.to;
      if (validateRegions(next, stars) && !findAnotherSolution(next, stars)) {
        regions = next;
        applied += 1;
      }
    }
    return {
      n: n,
      level: puzzle.level,
      regions: regions,
      stars: stars,
      palette: puzzle.palette,
    };
  }

  function stampLevel(puzzle, level) {
    var stamped = {
      n: puzzle.n,
      level: level,
      regions: cloneRegions(puzzle.regions),
      stars: puzzle.stars.slice(),
      palette: puzzle.palette ? puzzle.palette.slice() : makePalette(puzzle.n, createRng(levelSeed(level, 7))),
    };
    var turns = level % 4;
    for (var i = 0; i < turns; i++) stamped = rotatePuzzle(stamped);
    if ((level >>> 2) & 1) stamped = flipPuzzle(stamped);
    return nibblePuzzle(stamped, level);
  }

  function makePalette(n, rng) {
    var palette = Array.from({ length: n }, function (_, i) {
      return i;
    });
    shuffle(palette, rng);
    return palette;
  }

  function buildLevelPuzzle(level, attempt) {
    var spec = levelSpec(level);
    var n = spec.n;
    var rng = createRng(levelSeed(level, attempt));
    var stars = generateStarPlacement(n, rng);
    if (!stars) return null;

    var rows = Array.from({ length: n }, function (_, i) {
      return i;
    });
    shuffle(rows, rng);
    var want = desiredSingletons(n, spec.progress, attempt);
    var singles = rows.slice(0, want);
    var regions = growRegions(n, stars, rng, singles);
    if (!regions || !validateRegions(regions, stars)) {
      regions = growRegions(n, stars, rng, []);
    }
    if (!regions || !validateRegions(regions, stars)) return null;

    if (findAnotherSolution(regions, stars)) {
      regions = enforceUniqueness(regions, stars, rng);
      if (!regions || findAnotherSolution(regions, stars) || !validateRegions(regions, stars)) {
        return null;
      }
    }

    return {
      n: n,
      level: level,
      regions: regions,
      stars: stars,
      palette: makePalette(n, rng),
    };
  }

  function rotateRegions(regions) {
    var n = regions.length;
    var next = Array.from({ length: n }, function () {
      return Array(n);
    });
    var r, c;
    for (r = 0; r < n; r++) {
      for (c = 0; c < n; c++) {
        next[c][n - 1 - r] = regions[r][c];
      }
    }
    return next;
  }

  function flipRegions(regions) {
    return regions.map(function (row) {
      return row.slice().reverse();
    });
  }

  function remapShapeKey(regions) {
    var map = {};
    var next = 0;
    var parts = [];
    var n = regions.length;
    var r, c, id;
    for (r = 0; r < n; r++) {
      var row = [];
      for (c = 0; c < n; c++) {
        id = regions[r][c];
        if (!Object.prototype.hasOwnProperty.call(map, id)) map[id] = next++;
        row.push(map[id]);
      }
      parts.push(row.join(","));
    }
    return parts.join("/");
  }

  function canonicalShapeKey(regions) {
    var best = null;
    var base = regions;
    var f, t, g, k;
    for (f = 0; f < 2; f++) {
      g = base;
      for (t = 0; t < 4; t++) {
        k = remapShapeKey(g);
        if (best == null || k < best) best = k;
        g = rotateRegions(g);
      }
      base = flipRegions(base);
    }
    return best;
  }

  function compactShapeKey(key) {
    return String(key).replace(/,/g, "");
  }

  function expandCompactShape(compact) {
    if (!compact) return "";
    return compact.split("/").map(function (row) {
      return row.split("").join(",");
    }).join("/");
  }

  /* <SHAPE_BANK> */
  var SHAPE_BANK_COMPACT = ["","0000/0001/2000/0030","0000/0001/2033/3333","0000/0011/2003/3333","0000/1112/1111/3331","0001/1111/1123/1222","00000/00001/00233/44443/44333","00000/00001/02222/33342/33332","00000/00001/02223/42333/22233","00000/00001/02311/22211/22241","00000/00001/20223/22243/23333","00000/00001/22003/22233/24333","00000/00001/23001/33441/33444","00000/00010/20113/11113/14444","00000/00010/20314/33344/33444","00000/00010/22222/33332/33344","00000/00011/20031/40331/44331","00000/00011/20211/22231/24211","00000/00011/21111/33333/33433","00000/00011/22331/22221/22241","00000/00012/13112/11111/44444","00000/00012/30022/33324/33222","00000/00012/30212/42222/44442","00000/00012/30222/30422/33322","00000/00012/32222/33244/33222","00000/00100/21133/11133/44113","00000/00100/22222/23342/44444","00000/00102/00113/41133/11333","00000/00102/03342/03442/00444","00000/00110/02330/04333/04433","00000/00110/21111/31141/33444","00000/00110/22211/22231/24233","00000/00111/00211/30001/44441","00000/00111/00211/32214/22444","00000/00111/02131/22134/22333","00000/00111/02133/04433/04433","00000/00111/02211/32114/22444","00000/00111/11112/13422/44442","00000/00111/20331/22111/21141","00000/00111/22113/22211/22244","00000/00111/23111/22444/24444","00000/00112/03122/01122/01422","00000/00112/03412/33312/33312","00000/00120/01113/03333/04443","00000/00121/03111/33411/33444","00000/00122/00222/34232/33333","00000/00122/30122/11122/14222","00000/00122/33342/33444/34444","00000/01002/01022/33422/33322","00000/01002/01303/44333/44433","00000/01002/11111/31334/33344","00000/01002/11342/11144/11144","00000/01002/31112/33312/34322","00000/01011/21113/22244/24444","00000/01020/00022/00333/43333","00000/01022/01322/11333/11433","00000/01022/33324/33322/32222","00000/01023/11333/11333/11334","00000/01102/11322/12222/12442","00000/01102/33142/33122/33222","00000/01110/02234/02233/22233","00000/01110/11222/13242/14442","00000/01111/01112/34222/33332","00000/01111/02211/22334/22333","00000/01111/11222/13422/44442","00000/01111/21134/21333/21113","00000/01112/01222/02232/42233","00000/01112/11311/41411/44411","00000/01120/01333/44433/44433","00000/01120/03110/33311/34444","00000/01120/31122/31324/33322","00000/01122/11123/12224/12244","00000/01123/01222/01122/41222","00000/01123/11122/12222/42222","00000/01203/01222/11222/41122","00000/01203/42233/42233/44433","00000/01222/02232/44333/44433","00000/01222/33442/33444/33344","00000/01223/00223/22223/22423","00000/01223/11222/11222/42222","00000/01230/11133/14113/11113","00000/01232/01222/11422/14444","00000/10022/10000/10333/00433","00000/10022/11222/13222/44442","00000/10023/10333/10333/00433","00000/10023/11222/11222/11242","00000/10222/10222/10023/10423","00000/10222/10322/11222/11242","00000/10222/10323/14333/11133","00000/10222/11232/14332/13333","00000/10222/13422/11442/11222","00000/10222/33222/33322/33342","00000/10223/10033/10033/11433","00000/10232/10222/10224/14444","00000/10233/22233/22233/22334","00000/11022/10002/11113/14444","00000/11022/13042/11042/11022","00000/11022/22223/24333/23333","00000/11023/11223/11433/11333","00000/11112/31144/33344/33334","00000/11112/31311/33344/33444","00000/11112/33412/33332/33222","00000/11122/11113/13343/13333","00000/11122/11132/11433/13333","00000/11123/14133/44433/44333","00000/11223/11123/14223/11133","00000/11234/12233/11233/11222","00000/12034/11334/11333/11133","00001/00001/02011/03033/43333","00001/00001/23011/24441/24444","00001/00002/30222/33322/34333","00001/00002/33222/33332/33422","00001/00002/34422/44222/44442","00001/00011/02221/33224/33322","00001/00011/02231/22334/23333","00001/00011/20011/20341/22244","00001/00011/20111/00311/33334","00001/00011/22231/24411/22444","00001/00011/22331/22331/42233","00001/00021/03331/33331/34444","00001/00021/30041/00441/04444","00001/00021/30441/33341/33444","00001/00021/34441/34411/33444","00001/00111/00112/33322/33342","00001/00111/00222/34322/33332","00001/00200/03333/33333/44333","00001/00211/03241/22244/22444","00001/00211/30211/33214/33222","00001/02001/33341/33444/33344","00001/02011/02211/22113/22413","00001/02011/22011/30044/00444","00001/02011/33014/33114/33311","00001/02031/02211/22221/24444","00001/02031/42211/42221/42222","00001/02111/02113/22244/22444","00001/02111/02222/22333/22433","00001/02111/11111/33344/33444","00001/02111/22111/11131/14333","00001/02111/33311/33441/33344","00001/02111/33331/33444/33344","00001/02111/33441/33441/33344","00001/02300/33304/33344/33444","00001/20011/22213/24211/44411","00001/20300/23330/22433/24433","00001/22000/22222/33344/33444","00001/22000/23300/23333/24333","00001/22011/20011/23314/33311","00001/23111/33141/33144/31144","00010/20000/00003/44433/44433","00010/23000/33000/34444/33444","00011/00001/00201/22233/24233","00011/00002/22222/22332/24333","00011/00011/02213/22211/42211","00011/00011/20013/20004/22444","00011/00011/20031/23334/22333","00011/00011/23331/23433/22233","00011/00021/03321/33222/34222","00011/00111/11112/33311/33341","00011/00111/11112/33312/43312","00000/00010/02033/42333/44444","00000/00010/20010/20334/20044","00000/00010/21111/22334/22444","00000/00010/21113/24433/44444","00000/00010/22210/23310/22244","00000/00011/00211/30222/32244","00000/00011/20001/30044/33044","00000/00011/20111/20033/24033","00000/00011/20331/20011/00044","00000/00011/22311/22334/22224","00000/00011/23111/23441/22222","00000/00011/23314/23314/33333","00000/00100/00122/03111/33444","00000/00100/02103/22243/24443","00000/00100/11122/33124/11144","00000/00102/00102/03100/33440","00000/00110/20340/20340/20444","00000/00111/11112/33322/33442","00000/00112/02222/03222/03442","00000/00112/11112/13111/33444","00000/00112/33122/11122/14111","00000/00120/30120/30220/34422","00000/00120/31120/33144/33333","00000/00122/00111/30141/30144","00000/00122/01111/03334/03334","00000/00122/01112/03222/33444","00000/00122/30114/30114/00111","00000/00122/33111/33411/33311","00000/01020/01324/03344/03333","00000/01022/01000/11103/44443","00000/01022/01033/04033/44033","00000/01023/01333/01334/11334","00000/01102/00002/03004/33444","00000/01102/01102/11133/44333","00000/01102/01332/11334/11344","00000/01102/03002/03300/33440","00000/01102/03102/03302/04444","00000/01111/01112/31442/33332","00000/01120/00120/31120/34422","00000/01122/00112/00322/44333","00000/01123/02223/04422/00022","00000/01123/04423/04223/02222","00000/01223/02233/02444/22244","00000/10002/10332/10033/10044","00000/10022/10000/11030/14433","00000/10022/10003/10003/11443","00000/10023/14223/44422/44442","00000/10122/11111/11311/33344","00000/10203/10203/10244/12224","00000/10222/12222/13333/11433","00000/10222/30022/33042/33042","00000/10223/10023/44222/42222","00000/10233/10224/10024/12222","00000/10233/10233/10333/10443","00000/10233/10243/10443/00044","00000/11022/10022/10003/10443","00000/11023/14022/44022/44422","00000/11112/11112/13144/13111","00000/11122/33323/43333/43333","00000/11123/11443/44443/43333","00000/11233/13334/13344/13333","00001/00001/02021/32222/32444","00001/00001/22302/22222/22444","00001/00011/02000/22033/24443","00001/00011/02000/22034/33334","00001/00011/02001/02234/22334","00001/00011/02001/22003/44403","00001/00011/02001/22034/22334","00001/00011/20001/22223/44433","00001/00011/20003/20003/22444","00001/00011/20003/20003/44403","00001/00011/20021/22223/22443","00001/01111/00221/30000/33444","00001/11111/23331/23431/22444","00000/10233/10243/10043/11444","00011/20003/22333/22343/33344","00011/00000/00223/43333/44433","00011/00012/33212/23222/22244","00011/02001/02011/33044/33004","00001/00221/33211/32244/33444","00001/02201/03244/33244/33224","00001/02311/42321/42222/44222","00001/02331/22311/24444/22244","00001/00231/40233/40233/44222","00001/01111/22231/22431/24444","00000/12213/11113/14443/44433","00001/01111/01211/33244/33244","00001/02211/00233/40233/44223","00011/00011/22223/23333/22244","00011/01111/00213/44213/44213","00001/02111/22213/44313/44333","00001/01111/00222/03244/33344","000000/000001/022301/422000/444550/440000","000000/000001/023441/024451/024555/224455","000000/000010/223014/333344/333444/353334","000000/000011/000211/302214/555244/522244","000000/000011/000211/344222/333332/335222","000000/000011/002311/042221/444225/445555","000000/000011/022231/042231/055331/055531","000000/000011/222221/233311/233341/225311","000000/000011/223331/222331/244331/444531","000000/000012/003312/043312/053312/055322","000000/000012/034542/334542/334442/334222","000000/000110/201111/201134/555133/555533","000000/000110/222111/324411/524444/555554","000000/000111/000211/030000/330040/335544","000000/000111/000211/330222/334442/444452","000000/000111/002211/034251/044255/004222","000000/000111/011112/034152/044452/044442","000000/000111/023441/023445/024444/022244","000000/000111/220131/222331/242333/444453","000000/000111/230441/330444/355544/335554","000000/000112/001112/003132/043332/555555","000000/000112/031112/031142/035112/035555","000000/000112/300122/111142/551144/111111","000000/000122/003112/033312/043332/444532","000000/000122/011132/013332/111342/155332","000000/000122/022222/034455/033355/033335","000000/000122/034112/334312/353312/333312","000000/000123/001133/003333/044535/555555","000000/000123/011133/041135/041133/444333","000000/001002/031044/034444/035555/333555","000000/001002/111102/133322/133425/555555","000000/001022/001134/303334/333344/335444","000000/001022/011123/114423/154223/111123","000000/001110/021330/041344/044444/055555","000000/001111/022311/023334/024454/224444","000000/001111/023441/023444/223354/223344","000000/001111/200341/204445/205545/205555","000000/001112/003222/402252/402255/400222","000000/001120/001120/331120/333422/533222","000000/001120/111122/133222/444442/454442","000000/001122/001111/033441/033441/333544","000000/001122/001112/001134/051444/555444","000000/001122/001122/303455/333555/333555","000000/001122/011113/013143/033333/333555","000000/001122/301142/331442/233222/222252","000000/001123/001122/044425/044455/445555","000000/001123/001433/444433/333333/555533","000000/001220/001233/401233/401253/400233","000000/001222/001122/011332/444433/444453","000000/001222/011222/112233/114433/154333","000000/001233/011434/014434/115444/144444","000000/010222/011332/111332/144432/444532","000000/010222/110332/111332/141332/113352","000000/010222/330244/334444/333335/355555","000000/010223/011122/111452/144442/444222","000000/010233/010233/014223/012253/015555","000000/011002/013222/113455/533335/555555","000000/011002/013344/111344/533354/555554","000000/011022/011322/013322/333242/335222","000000/011022/013342/113542/133342/133442","000000/011022/013432/013333/111133/115133","000000/011022/310022/114522/111552/111552","000000/011102/331102/311402/353402/333302","000000/011110/011112/033311/333344/335555","000000/011111/000221/030421/030441/335441","000000/011122/012222/000322/450024/444444","000000/011123/001122/000122/404552/444555","000000/011123/001223/101223/111443/115333","000000/011123/014422/014122/011112/115552","000000/011123/111122/411112/444422/445444","000000/012003/012044/012044/012555/222555","000000/012222/112344/112544/115554/555544","000000/100022/133324/333324/344454/344444","000000/100023/110224/100544/105554/555444","000000/110233/100334/100034/155004/555544","000001/000111/021111/023344/023344/225333","000001/000201/300000/334055/334055/333055","000001/001111/211111/223444/223454/244444","000001/002011/310011/411111/411115/445555","000001/002033/222333/244445/244255/222225","000001/002111/322111/224155/244445/255555","000001/002111/322111/322441/335444/333444","000001/021031/221111/222222/224554/224444","000001/022001/222300/444400/455000/550000","000001/022011/032221/032221/433311/433335","000001/023221/022211/024411/444511/444555","000001/111111/122223/124223/125553/155333","000001/200011/220331/420311/220351/220555","000001/200111/221111/222231/425533/555333","000001/201111/331111/331455/344455/345555","000001/202333/222333/224443/555443/554443","000001/203111/203111/233141/233155/333355","000001/211101/333111/443151/433151/433555","000001/220001/220331/422221/424521/444422","000001/220031/200001/241111/241551/244444","000001/222201/322111/332211/344222/333522","000011/000001/222331/422231/443335/444433","000011/000011/002013/242213/222233/552233","000011/000012/111113/445133/444433/444333","000011/000111/000213/442211/444221/444251","000011/000111/200111/304155/304555/334444","000011/000111/234151/224151/224155/444155","000011/000112/000222/300224/333224/533444","000011/000112/003113/443333/443355/444355","000011/001111/021111/222333/245343/244443","000011/002011/032111/332214/532214/331114","000011/002211/000211/333222/334542/334444","000011/020001/220031/244455/244555/224445","000011/021111/031111/333333/344444/444554","000011/200001/222211/233334/233333/333553","000011/200111/220111/223333/423333/422253","000011/220111/230111/240555/244445/444555","000011/230000/233333/224333/224335/444333","000012/000002/033022/333000/434445/444555","000012/003212/000222/444255/455555/444555","000111/000112/300222/330242/534442/333444","000000/000011/002003/442203/455205/445555","000000/000012/300112/304412/304002/300055","000000/000110/021110/023340/053340/555444","000000/000110/022213/033333/034453/033353","000000/000111/023114/022514/022554/055554","000000/000111/200011/233455/224445/222444","000000/000112/000111/030001/333455/344444","000000/000112/001112/031144/031554/335554","000000/000112/033332/033242/055242/022222","000000/001011/001112/033412/033412/553332","000000/001023/001423/551422/454442/444442","000000/001110/201310/221340/225330/555333","000000/001110/221111/233311/222341/255344","000000/001111/002221/034444/334454/334444","000000/001122/001112/031422/331222/322255","000000/001122/031111/034444/054444/055544","000000/001122/031122/011114/044444/055444","000000/010002/110332/111322/141333/145555","000000/010022/013222/033442/034445/033335","000000/010222/010223/012223/045553/044333","000000/010222/010333/010443/055443/003333","000000/010223/011123/012222/042222/222555","000000/010223/014423/011122/015552/115555","000000/011002/111022/133004/133504/334444","000000/011022/010023/040003/045503/055333","000000/011102/031102/031142/055444/044444","000000/011110/011112/013122/033144/055544","000000/011111/002331/003331/403331/445555","000000/011111/012231/033331/003341/055544","000000/011111/111222/133324/135544/333333","000000/011112/001312/043332/044432/444522","000000/011112/011112/011333/041335/441155","000000/011112/031412/531412/551112/111111","000000/011203/114433/414333/444533/445533","000000/011222/011122/011132/041333/441555","000000/100002/100222/000232/040332/444555","000000/100022/111022/131004/333004/355000","000000/102034/105034/115034/155554/155555","000000/102222/103422/103332/003555/055555","000000/110011/111112/333412/333411/444455","000000/110222/000020/030000/030440/333455","000000/110222/130022/430522/433552/455552","000000/110222/330022/333224/333444/334445","000001/000011/020013/420013/422213/445513","000001/000011/221111/222213/244223/244555","000001/000111/000112/030011/333441/555444","000001/001111/000022/330224/300554/305555","000001/002201/322224/322244/335555/333355","000001/022221/342221/344222/335222/333222","000001/022231/042332/042222/002222/500022","000001/022331/222311/242335/243325/222225","000001/202203/222333/222334/533334/554444","000001/220101/000111/030014/030555/330055","000010/222000/222033/444533/445553/444455","000011/000001/022201/033201/433305/444335","000011/000111/020031/220333/220434/250444","000011/000111/233141/233145/233144/223144","000011/000221/000011/333333/334444/334454","000011/000221/300221/300001/304405/333305","000011/220001/222000/220003/220403/554443","000011/222013/224013/250011/255011/555001","000111/000112/030000/334440/344455/334445","000000/000011/020331/022231/002244/005544","000000/000100/011122/034122/034452/033355","000000/100203/104203/114200/112250/555555","000001/022111/023113/223333/444444/454444","000011/022221/222222/233344/244444/254444","000001/110011/211111/233344/223545/333555","000000/001122/011111/033444/033455/044455","000000/011023/441023/411122/415552/445222","000001/111101/213111/213331/414531/444555","000000/100223/101143/111443/551133/533333","000111/000001/020222/322224/335544/333555","000001/200011/222011/223011/223445/333455","000000/100222/102233/104235/114235/444233","000000/001233/011223/111423/151423/155443","000111/011122/000112/333332/444432/455533","000000/102222/102333/104443/155544/111554","000001/002211/002222/302422/302445/332555","000011/000011/222001/233400/223455/224455","000011/020331/023311/222322/242225/244255","000011/222031/243331/445533/444553/444555","000011/000011/023111/223414/553444/553444","000011/222001/222300/244305/444355/443335","0000000/0000001/2000000/2304444/2300054/2300444/2266666","0000000/0000011/0230441/0333441/0344444/0355544/0665554","0000000/0000011/2033111/4003311/4433111/4435551/4446555","0000000/0000011/2200111/2203311/2224353/2424333/4444633","0000000/0000011/2333341/3353541/3355541/5556541/5555541","0000000/0000101/2001111/2231114/2531116/5551666/5555666","0000000/0000111/0000231/4052233/4056233/4052233/0055555","0000000/0001022/0311122/0334222/3344452/3346555/3445555","0000000/0001100/2000003/2403333/2403333/2444335/2226555","0000000/0001111/0002221/3022222/4044442/4445452/4465555","0000000/0001111/2211111/2213331/4223311/4243551/4445556","0000000/0001112/3011111/3014444/3000454/3005555/3333366","0000000/0001233/0001113/0004133/5561133/5561133/5666113","0000000/0010002/3411022/3111022/3355052/6355555/3335555","0000000/0010220/0314522/0114522/0155562/1156662/1666666","0000000/0010220/1110322/1410562/1000562/1505566/5555566","0000000/0010233/4000233/4402223/4002333/4442335/2222655","0000000/0011002/3114002/1154002/5550002/5556000/5556600","0000000/0011102/0031102/0444102/0544502/0555552/5555662","0000000/0011111/0012213/0442223/0002533/5622553/5555533","0000000/0011111/0222331/0333331/0443533/0444555/0465555","0000000/0011111/1111222/1113422/1333556/3335566/3336666","0000000/0011233/0041113/0441433/5544433/5545333/5555563","0000000/0012203/0012403/0115433/0155443/0165553/1111113","0000000/0012220/0112330/0112340/0522333/5552333/5556333","0000000/0012220/3011330/3003340/3333440/3356666/3336666","0000000/0100111/0111112/0333312/3334442/3335422/3633222","0000000/0100222/0111222/0133242/0335442/0335446/0344444","0000000/0100230/1140222/1150622/1550626/1150626/1000666","0000000/0102033/0104443/0104333/0111133/0556666/0555556","0000000/0102222/0102222/1122344/5116644/1116664/1116666","0000000/0102222/0112322/0011124/0556644/0566644/0564444","0000000/0102304/0102224/1112254/6111244/6162244/6666664","0000000/0102320/1102222/1102224/1105544/1505444/5555446","0000000/0102333/0145663/0145563/4145666/4446666/4444666","0000000/0110223/0140333/0444443/0554443/0555643/0555543","0000000/0111111/0211113/0114453/0664453/0444455/0444445","0000000/0111213/0411113/0411133/0433113/0053333/0666666","0000000/0122343/0122333/0155633/1156666/1111166/1116666","0000000/1022203/1002203/1444223/1145533/1145553/1145653","0000000/1023333/1022334/1023344/1004444/1054544/1555564","0000000/1100233/1100033/1111111/1145516/1444516/1455566","0000000/1112223/1442222/5544422/5564224/5444444/5555444","0000001/0000021/3004111/4444155/4555555/4465556/4666666","0000001/0000111/2001111/3304411/3354441/3344446/3366666","0000001/0001111/0202211/0222213/0244433/4444533/4655533","0000001/0001221/3311111/4333111/4433151/6443155/4443111","0000001/0002001/0322211/0333241/3355644/3555544/3355555","0000001/0002111/3002221/3302224/3352566/3555566/3355556","0000001/0011111/0022111/3032211/3333214/3333555/3365555","0000001/0011111/2000311/2200341/2233344/2255654/2555554","0000001/0020033/0224533/0244336/2243366/2244466/2244666","0000001/0023301/0223111/4333131/4433333/4443335/4444633","0000001/0200301/0444301/0055301/0055301/5555303/5565333","0000001/0200331/2224111/2522111/5555516/5555116/5666666","0000001/0222011/0022231/2224233/3333333/5555333/5565333","0000001/1111111/2222211/2324555/2325555/2335565/3355555","0000001/2000000/2223444/5222464/5224466/5554666/5554466","0000001/2003111/0003314/5503334/5000334/5333334/5556344","0000001/2003111/2222111/2222411/2552444/6554444/5544444","0000001/2003111/2233311/4433331/4433531/6455511/4445555","0000001/2200111/2200011/0000013/0343333/0333533/0635555","0000001/2200221/2222211/3333311/3333411/3444415/3644444","0000001/2220111/2220111/2300451/2660451/2600555/2665555","0000011/0000111/0021111/3024441/3034444/3335564/3335554","0000011/0000111/2220111/3324111/5321155/5555555/6666555","0000011/0001111/0221333/0221333/2244553/2264455/2244455","0000011/0001211/0111113/0144443/0154443/1155533/5556533","0000011/0002021/0302221/2222111/2455516/2441116/1111666","0000011/0002221/0000333/0444333/0044333/5444436/4444336","0000011/0011112/3011112/3334422/4344425/4444222/4466662","0000011/0012111/0011113/4055553/5556353/5566333/5566663","0000011/0021113/0221333/0221343/2221553/2265553/2255555","0000011/0022221/0000021/3045622/3355622/3355622/3356662","0000011/0200011/0222313/0242333/4442235/4645555/4445555","0000011/0200111/0230111/2245116/2445116/2446666/2244666","0000011/0201111/2222311/2233331/2333444/2224445/2624444","0000011/0220011/2200331/4220311/2220333/2525333/2555633","0000011/2000111/2020111/2222344/3333344/3333345/3365555","0000012/3033002/3333202/4445222/4445566/4455566/4455666","0000111/0000001/0002222/3444222/3544444/3333434/3363334","0000111/0000011/2220111/3322111/3333144/3555144/5556144","0000111/0000121/0331121/4435121/4435522/4635222/4455222","0000111/0002221/0322221/0324411/3324445/3633445/3333555","0000111/0200211/2202211/3222244/3352464/3332464/3332444","0000111/2300111/2002114/2222114/5522144/5522246/5224444","0000000/0000010/0221111/0331441/3344411/3334555/3633333","0000000/0000011/0002221/0302224/0332444/0532646/0533666","0000000/0000011/0023411/0224451/0004451/4004455/4444665","0000000/0000011/0222211/0332241/0566244/0566244/6666244","0000000/0000012/0324412/0322222/0225566/0225555/0222222","0000000/0000012/3344012/3344552/4344452/4442222/4622222","0000000/0000100/2111133/2122134/2224444/5525554/5555664","0000000/0000110/0222222/0333332/0433222/0444252/4466652","0000000/0000111/0022131/2222231/2224221/2554461/4444661","0000000/0000111/2222111/2322441/2322451/2363455/2333444","0000000/0000112/0340562/0345562/0345222/0344242/0444444","0000000/0001023/0001223/0401123/4401223/4400053/4660055","0000000/0001100/0022100/0221103/0245003/0445006/4455666","0000000/0001110/0001123/4001553/4611533/4666333/4446333","0000000/0001110/2011133/2211433/5241443/2244466/2222266","0000000/0001111/2011343/2003333/2555553/2556666/2555556","0000000/0001112/0111232/0144222/0544622/0546666/0555556","0000000/0001121/0333111/0333311/0435111/0335661/3355566","0000000/0001223/0401223/4402223/4400333/4333335/4655555","0000000/0010222/0311244/0311111/0335566/0335556/0035556","0000000/0010222/1110032/1140332/1440333/1450363/1453363","0000000/0010222/3010222/3004422/3000022/3356662/3355522","0000000/0011020/0311024/5360044/3360044/3366044/3666444","0000000/0011100/0111233/1111244/1514224/1514444/5514466","0000000/0011100/2011333/2011334/2015333/2565353/5555555","0000000/0011102/0001322/0400025/0444425/0666665/6665555","0000000/0011110/1112213/4122513/4122611/4444611/4446666","0000000/0011112/0011132/0013334/5016644/0016444/0044444","0000000/0011203/0111223/0144222/0444442/0544446/5544666","0000000/0011234/0011234/0011133/0555553/0563333/5566666","0000000/0012220/0312454/3312444/3312444/6311114/3311111","0000000/0100222/0113332/0444352/0464452/0066552/0555552","0000000/0102222/1102222/3222332/3445333/3433333/3336663","0000000/0102332/0102222/0104444/0504444/0555464/0555564","0000000/0110002/3411222/3511222/3555626/3555666/3333666","0000000/0110220/0122233/0023333/0425336/0423366/2222266","0000000/0110222/0222223/0244233/0546333/0546663/0443333","0000000/0110223/0410223/0444533/0000533/0055555/0655555","0000000/0111002/3441222/3441122/5446112/5555112/1111111","0000000/0111022/0111023/0143023/0133033/0533336/0556666","0000000/0111023/0144023/0114222/0111222/0001252/6661255","0000000/0111111/0233413/0233313/0225333/0255663/0055555","0000000/0111112/0133411/0553466/0553366/5553366/5533333","0000000/0111120/0333324/0566344/0556344/0056644/0555555","0000000/0111122/0311133/0334433/0333335/0036635/0333333","0000000/0111222/0131244/0531224/0531244/0551116/0555555","0000000/0111223/0431333/0433333/0453363/0456666/0444444","0000000/0111223/0454423/0454623/0454622/0444222/0444442","0000000/0111233/0111333/0001344/0501664/5566644/5566444","0000000/0120033/2220033/2420553/2420056/2440056/2400556","0000000/1000023/1040223/1045523/1055222/0005526/0555566","0000000/1000223/1130223/1330333/4333353/4355553/6665553","0000000/1100022/1100332/1000033/1114453/6644443/6444333","0000000/1100233/1102233/1104223/5102223/5106223/1106622","0000001/0000011/0002223/2222223/2442555/2465555/4444455","0000001/0000011/0201111/2201134/2205134/6006334/6666333","0000001/0000211/0003221/0403321/4455326/4555322/4442222","0000001/0002001/0022033/2022033/2222443/5666643/6664444","0000001/0202111/0222113/0442566/0455556/4456666/4456666","0000001/0221111/0221341/0233331/0555111/0055111/5555166","0000001/0222201/2203201/2000004/5050044/5555044/5655554","0000001/0222233/2244433/2444333/2245333/2255333/2333366","0000001/1111111/2311111/2114441/2224444/2555544/2665554","0000001/2000111/2000001/2220301/2420311/4420515/4660555","0000001/2000111/2000311/2000311/2240111/4444115/4466655","0000001/2000201/2222233/4444223/4566623/4566622/5566222","0000001/2023400/2023433/2023333/2222233/2556633/2566663","0000001/2201111/3004441/3304441/3300011/3335006/3355506","0000011/0000111/2000313/2440333/2440533/2466553/2223333","0000011/0020001/2322201/2322201/2222204/5522204/6660004","0000011/0022111/3000111/3301111/3311145/3336555/3666555","0000011/0200001/0222222/2233334/2222234/5266636/5226666","0000011/0220001/0222331/0442335/6662235/6666635/6666635","0000011/0222313/0233333/0233334/0244444/5664444/6664444","0000011/2000011/2003000/2203400/5003440/5066644/0066444","0000011/2001111/2001111/2233333/2223443/2254444/5555564","0000011/2201111/2200331/0000031/0445533/0444433/0004463","0000011/2223441/2553444/6653344/6653444/6553333/6553333","0000012/0300011/0340111/0330111/3330111/3550066/3555566","0000012/1111112/1111122/3443122/3333125/3331125/6633335","0000012/3300012/0001112/0001122/4401115/4401665/4001666","0000111/0000111/2220113/4520133/4420636/4220666/4440000","0000000/0000112/3001122/3041552/3041555/3044445/4444466","0000000/0000112/3040522/3345552/3345562/3344522/4444444","0000000/0001022/0031452/0033455/6663445/6633444/6666664","0000000/0001100/0111122/0133111/0443151/6643155/4443155","0000000/0001123/0400223/4450203/4450006/4446606/4666666","0000000/0010022/0111113/0043333/0444533/0664553/0444333","0000000/0011022/0111003/0441003/5433333/5336633/3366333","0000000/0011111/0221111/2233411/2333411/2536441/5555551","0000000/0011112/0000222/0000342/5633344/5335334/5555344","0000000/0011222/0022222/2222233/2455636/4446636/4444666","0000000/0012222/0012344/0115344/0555334/6655434/4444444","0000000/0012223/0011113/0004133/5504113/5500003/5566333","0000011/0220001/0222221/0333321/0043334/5444444/4466644","0000000/1110223/4410323/1113333/3333353/3665553/5555553","0000001/2220301/4523301/3522301/3555331/3333311/6666333","0000000/0012230/0222334/0022554/2222544/6662544/6555544","0000001/0023333/0223444/2223554/6633544/6336644/6666664","0000001/2201131/2405131/2405111/2405116/4405511/4555551","0000000/0000112/0344412/0345411/0355446/0355466/0666666","0000000/0011112/0312442/0332222/3333335/3663355/3355555","0000111/0200011/0233013/3333033/4443335/6644335/6663355","0000001/2111101/2233111/4253111/4253316/4555556/4555666","0000111/2000221/2222211/3322211/3444555/3434466/3334446","0000001/0233411/0222414/0552444/0055554/5556644/5566444","0000011/1101011/2111111/2233331/2445333/2465533/4465553","0000000/0001112/0033322/3333332/3443322/3544366/3544666","0000000/1000222/1000002/1304400/3333444/5556644/5566644","0000000/1102223/1400223/4400525/4605525/4666555/4446666","0000001/0233000/0223333/0245333/0445553/6444453/6644553","0000011/0000111/0200111/2230114/2530444/2530066/2555566","0000001/0111101/0121111/0223344/0555334/6665444/6665544","0000011/2200011/3203111/3203144/3303544/3333566/3335566","00000000/00000011/02000311/22024111/22224441/25554444/56554777/55577777","00000000/00000011/02222221/22333321/22244331/25254441/55554461/55557466","00000000/00000011/22201111/34200151/34400551/44660555/44460575/46660555","00000000/00000111/00002311/22022441/22224451/25555551/25677751/26667751","00000000/00000112/00000012/33031112/33334122/35366662/55366666/55555676","00000000/00000120/03333122/33343111/35344441/33446671/43466611/44444661","00000000/00001000/21111110/33455500/33445506/37444506/37477700/37777777","00000000/00001111/00221333/00111333/40155563/44155663/41115666/44555576","00000000/00001111/02111133/11111333/44155553/64176563/64176663/66666663","00000000/00001222/00222233/44422223/44555333/44453336/44455537/44444477","00000000/00011022/00311122/00011222/04441552/05555562/07556562/55566662","00000000/00011102/30411222/30551262/30511266/33555226/33566666/35567666","00000000/00011122/00011333/04413333/04111333/44411353/44465555/47444555","00000000/00011222/00311212/04312212/03311115/03666777/03367767/03666667","00000000/00012233/40013333/45513663/44513633/44516633/14511733/11111111","00000000/00012303/00011333/00441133/05441114/05444444/65555554/66666674","00000000/00012333/00222343/55552443/65755444/65775574/66777774/66666674","00000000/00110222/00133244/01135224/01332264/01322264/67332264/66666664","00000000/00110222/03111232/03144332/03333352/03336552/03555552/55577755","00000000/00110223/00144423/00544633/05544333/05547337/05577777/55777777","00000000/00111112/03311242/03111222/03555266/33557266/33522222/32222222","00000000/00111120/00031220/01111220/00445220/04422260/04227766/22227666","00000000/00112333/04152223/04111233/00161233/00662223/06677773/66677773","00000000/00122222/01122333/01122333/01222343/22255343/22655553/27777773","00000000/00122330/00114330/04514430/04411440/00444460/40444477/44477777","00000000/00122344/00123343/05526333/55526636/55226636/25222666/22266676","00000000/01000010/01112013/01411113/11555513/16666613/16677113/33333333","00000000/01111111/02333331/02222431/02525511/22555561/22766561/26666661","00000000/01222222/33222222/33444422/33355442/66335442/66355542/66667555","00000000/10000223/10400253/10005553/11106553/17700353/11703333/11700000","00000000/10000233/10033334/10044444/00045555/06045755/66044755/66666775","00000000/10200033/40222333/44522333/46552333/46522237/46633336/46666666","00000000/11022233/11020243/15000244/11622242/66662222/66666662/66677772","00000000/11102222/11103222/11403222/14433555/44435555/44335655/44555557","00000000/11110223/44410222/44111225/44444255/44444225/66462255/76666555","00000001/00111111/00213444/02254444/00255544/22225444/67625555/66666555","00000001/00211111/00222113/00241113/44441413/55644413/55664443/55573333","00000001/00220111/02230114/02230155/06665155/06655555/06777775/77777755","00000001/00230004/05222224/55562224/56666624/54446664/57444444/57444444","00000001/20003111/22045111/22245111/26245711/66445771/64455477/66444477","00000001/22000111/22200113/22200455/22204445/66204445/66664555/76664555","00000001/22330011/22000111/42220111/44220151/44220151/44225556/44275555","00000001/23332001/22222001/22242111/25242116/25542116/55544666/57444466","00000010/02220000/22322220/24425555/44555555/44666555/46666675/46666775","00000010/22203000/22223330/22222233/22456633/24466666/44466777/44777777","00000011/00200013/22240113/32240033/33333335/33333365/37773555/37777775","00000011/02202012/00222222/00222232/44452666/44755566/44455666/44455566","00000011/20000111/30000111/33334111/53633316/56666666/56677676/55577777","00000011/20001113/20004511/22044515/22044555/00004555/00644455/66667755","00000011/20022211/22021111/22222134/25256664/55556664/57556664/55566666","00000011/20300111/23301111/23311456/22333455/22335555/27337775/77777755","00000011/22030001/24330031/22333331/22536631/55536666/55333776/55333777","00000011/22333011/42303011/42200015/42260115/47255115/44551155/44455555","00000011/23004111/33044151/30004451/30000055/36666055/33676655/66676655","00000012/03333222/33344222/44442225/64422225/67777255/67667755/66677755","00000111/00011111/02031334/22333344/23334444/23334546/23355566/25557556","00000111/01111111/00021111/00223311/40422311/44455515/44466555/44766666","00000111/02200311/02222311/22222344/23552344/23333344/26633347/22633344","00000122/00000123/04444122/00411122/50444222/50044627/50666677/50066667","00000122/00000222/33330242/35633342/55555542/55444444/54477777/54444777","00001111/00000001/20000331/22223311/24222315/26666315/26663315/66673355","00001111/00222131/02222131/00233331/22244335/22243335/44644455/44447555","00000000/00000001/00022011/30425116/30425576/30425776/30027766/30227776","00000000/00000112/00033312/03334552/03344422/00666622/07222222/07777222","00000000/00000112/00222222/03322222/03342222/05555662/07755562/07777766","00000000/00000120/01111122/03114442/03344452/66644452/67645452/66665555","00000000/00001110/21111110/21113111/24413555/24513355/66517775/66555555","00000000/00001111/02202111/22222113/24445513/44646613/47666633/44666333","00000000/00001120/30111222/30001245/30601255/33607255/33602255/66622222","00000000/00001122/00003224/33333224/55633244/55552224/52572244/22222224","00000000/00001233/00401223/05411113/05551133/05511133/55516633/57716333","00000000/00010112/30011112/00045612/04446612/04446612/00446617/00666677","00000000/00010203/01110223/04511223/04551623/05551123/05557722/05555777","00000000/00011020/03001110/03334444/05333336/05557766/07777666/00777776","00000000/00011111/02223114/02111144/00000445/05606555/05666557/05555557","00000000/00011112/00011222/03011232/33333334/35544444/33566664/35557664","00000000/00011112/03344412/05364112/05364711/05364411/05566651/05555551","00000000/00011123/04444223/05554443/05544433/05564735/55664735/55555555","00000000/00011222/03044422/03045552/03044522/63022222/63027722/33022222","00000000/00011223/00011223/00000423/55500622/55560662/55566622/57666622","00000000/00011223/04451222/04451555/04451566/07555566/07775566/00775556","00000000/00012222/00222232/44422332/54226632/54456632/55556272/66666222","00000000/00012345/06612345/06611344/06613344/06111334/07144444/11111111","00000000/00100200/03102224/03335526/33335226/37755526/37775526/77755566","00000000/00111002/00031002/00031044/00531044/66531744/66551444/66655554","00000000/00111120/30111221/30111111/30415555/30446557/44444557/44444455","00000000/00112222/01122232/04424452/06444455/04474775/04477755/07777755","00000000/00112233/00112222/40011112/40115552/40444444/44466644/44667777","00000000/01000232/41005222/44005522/46005555/46000555/46066657/46667777","00000000/01022223/01124433/00124553/00124443/01122333/31663373/33333777","00000000/01023330/41023330/44043300/54445000/54555600/54566667/55555566","00000000/01100022/01000032/01044552/04444552/06644472/06447777/06666777","00000000/01100222/01111232/01145332/00145632/05555622/05766622/06666662","00000000/01100233/01110234/01111234/00522244/00524444/06555444/66665474","00000000/01102222/11334552/13335552/13366677/11667777/61666667/66666677","00000000/01102223/01444453/00444453/06665553/06775333/07777333/00073333","00000000/01102223/04555523/04566623/04567622/04777622/04447642/04444442","00000000/01111111/01112344/05152244/05552677/05222667/55622667/66666677","00000000/01120003/04122003/01120003/01111003/00555553/67755533/66665553","00000000/10000022/13330024/56630224/56550274/56550277/55550227/55555557","00000000/10000222/13322222/13345552/11345555/14444655/74445555/44445555","00000000/10223333/00023333/04023333/04022355/44066355/40065755/44065555","00000000/11002223/10002223/10000223/10440533/10440666/77440066/70000006","00000000/11002333/11002333/11002334/11222554/61622266/61666666/66667777","00000000/11100222/10000023/10400025/10444225/10622225/10662555/00777555","00000000/11110223/41122223/44422253/66422333/62222777/62222277/66666677","00000000/11122221/12122111/12223311/11111114/15555644/15765664/16666664","00000001/00002001/30100111/30111144/50116644/50446444/50544444/55547777","00000001/00011111/22222221/23324441/33324111/35644441/35557411/35777777","00000001/00022111/00021134/00331134/05531134/05533334/66663334/67663333","00000001/00222001/03222201/33244401/22254001/25554111/25611167/66666667","00000001/00222022/02222223/02222333/45222263/44472663/44446663/44666333","00000001/02003333/02233233/04222253/00662555/00666555/77666655/77776555","00000001/02200011/32200014/32330015/32300015/33306005/76666655/77777555","00000001/02203331/44303311/55333511/55555516/55577556/77776666/77766666","00000001/02324001/02224111/52211112/55222222/56622272/56667772/66666662","00000001/11111111/23333311/23444111/23541111/22222221/66666622/67777222","00000001/22033331/22031111/22000111/24000115/24046155/24446155/26666117","00000001/22202303/22222333/22224443/24444444/25446664/24477766/27777666","00000001/22233011/44200015/44406615/44406115/00006155/07666115/06611111","00000010/22002000/20022333/20222345/22252445/22655555/75555555/77777755","00000011/00001111/02003111/02233341/02223345/02623744/66666744/66667774","00000011/00200111/22200131/24200111/24250166/24550111/25570000/55577000","00000011/00220011/33322114/33552211/35522222/35522266/37527776/37777666","00000011/02000131/22200111/22220441/22440455/26444455/26664555/27775555","00000011/02022001/02222211/02234411/33234411/33335416/33334416/33377666","00000111/00000122/00300122/44344122/44441122/44441152/46446655/66666755","00000111/00000221/00202211/30222214/30444444/30454544/30455566/33475566","00000111/20330011/20234445/22234646/77233666/77773366/77773336/77333366","00001112/34003512/30003511/33333511/66373511/63375515/33375555/33775555","00000000/00000010/00220011/30222221/00445266/00445577/70044447/77777777","00000000/00000100/02311100/03334100/03444550/63744555/63755555/33333335","00000000/00000110/23334114/22334444/22333334/25536634/77666444/74444444","00000000/00001111/00200134/05230334/05233334/06222274/06666774/00444444","00000000/00001111/20003441/20553341/20033441/20663771/26661111/66666666","00000000/00010002/03110222/43150002/43156066/43666667/43637777/33333337","00000000/01100022/31100042/33101042/31111122/55555122/55666166/55776666","00000011/00001111/22221211/33422211/33452222/33455556/33444444/34444777","00000011/22001113/22200113/33330013/44433333/45444463/45555466/44575446","00000000/01233344/01333344/01563377/01566677/01555667/01115566/11155555","00000000/00000012/30440112/30540112/30544122/33333322/36666336/77766666","00000000/11002234/11101233/51111233/51122233/11166227/16166667/66667777","00000000/00011112/01111133/04413335/04613735/04613775/04611755/44677755","00000000/00110233/01100222/11000222/14005222/14065557/11065557/11111177","00000000/00102220/01122233/00024253/04444455/06664775/66644477/44444477","00000000/00111110/01112213/01222333/00242223/55244622/52244672/52666672","00000000/01100222/00110023/00410223/54410663/55550063/53353333/53333777","00000000/00111112/00212222/00222322/02243332/04444562/77775566/77777566","00000000/01102230/11102232/11112222/14444552/14464452/17766555/17666665","00000111/00111111/20122211/22223311/44233115/44231115/46633665/77666665","00000001/20340001/23344051/23345051/33335555/66655775/67777755/66677755","00000000/01122222/01222222/01113322/11133342/15144442/15556742/16666772","00000011/00022211/00021111/03222214/03333334/33556664/33357744/33557777","00000000/10002334/10002554/11222544/11122555/16627775/66222277/66662777","00000011/00000001/23030111/23334444/23333445/23634445/22664555/66664577","00000111/23300001/22333011/24443000/22243045/22444045/62774445/62777555","00000111/02220111/03200001/03222111/33334444/34444555/36644777/33666667","00000111/02000011/02230011/22330001/33344500/34445550/36467750/66666750","00000001/00002201/30302101/30302111/33302224/33506774/63556774/66666744","00000011/00000021/33300221/43305526/43307526/44477566/44475566/44777566","00000111/00020133/04420333/44422333/44422555/46227755/66226777/66666777","00000111/00020133/40420333/44422235/44422555/42226655/77227666/77777666","00000011/00220111/33221144/33322444/33322555/66226555/66626775/66666777","00000011/00200111/32221144/33322444/33322554/66326555/66626755/66666777","00000111/00020133/00420333/44422235/42422555/42226655/77277666/77777666","00000111/00020133/00420033/44422333/45422666/45227766/55255777/55555777","00000111/00020133/00420033/44422333/44422555/46227755/66266777/66666777","00000111/00220111/30321144/33322444/33322545/66326555/66226775/66666777","00000111/00020113/40420333/44422333/44422555/46227755/66226777/66666777","00000111/00020113/00220333/44422333/44422555/44226655/77227666/77777666","000000000/001022300/011024440/011122244/015126224/062226744/066666776/066666766/088866666","000000001/000021111/033334411/000333111/005111111/005555511/600577558/505577558/555557777","000000000/000000111/002211111/322111144/325444444/322666667/388888666/388886666/333333333","000000000/000000111/202330411/222230001/222233551/623337511/626655511/666888111/666666111","000000000/000012023/040512223/041113333/441133333/644443773/664663733/686667737/666666777","000000000/000123330/011144430/000111333/005533333/005555533/600575558/005575558/055777777","000000000/001111111/203444511/203434411/233333111/222663177/822633777/666663777/677777777","000000001/000222311/000233314/052233114/055233114/055533144/555673114/555777444/587777744","000000111/000002211/330042411/344444441/344441111/344455616/333756616/333356616/855555666","000000000/000001111/022000001/022003331/042205331/044444361/078666361/088666661/088886611","000000000/000100022/001113444/551613664/555633674/665636644/655666644/665666848/666688888","000000000/000111222/000122222/011113244/015114444/055544646/077746666/077846666/006666666","000000000/000122222/011112222/111132442/115633344/155553444/177753384/177773334/177777744","000000000/001022203/001023223/001123333/411333563/413377553/413377553/444777555/844777555","000000000/001111111/002213311/004213351/044263351/042223351/047233851/047735551/777777771","000000000/001111122/033333322/033344352/033345552/033344552/444446755/447777775/477877555","000000000/001122223/041111223/005551223/055552223/000555233/666555223/666665727/666668777","000000000/010002222/010303324/013333144/011353144/011111144/016666114/017778444/011777444","000000000/011020333/111022332/100042222/111445462/171144462/171114462/777811162/777777162","000000000/011022233/010022433/010002235/116662555/111662225/711668555/116688888/116668888","000000000/012103333/011101133/041111133/051116173/055566773/055777773/055888733/888888833","000000001/000111111/023114454/023134554/033334444/333333336/333733666/777766686/777776666","000000001/011000111/021111111/022314411/222334445/222234445/222633445/728888455/888555555","000000001/020031111/022231111/022331145/002334444/022344466/224447466/228866466/888866666","000000001/022230111/002244411/002241115/000441616/707466666/707666688/707688888/777888888","000000010/022230000/222444450/242444655/244466655/222266655/777786665/778788855/778888555","000000011/022222001/322222221/333452211/663444711/663344444/633333338/666333338/633388888","000000111/002200131/002440111/002445161/022445566/022245556/222445766/282885556/888866666","000000111/022200001/333222411/553221111/653221111/553321777/558333777/888377777/888377777","000000000/001123333/011223443/011124453/011114553/016115573/666115873/666655773/666665573","000000000/011120034/011122034/566112034/566212034/576222333/576853333/566555553/555555533","000000000/000110223/040115223/044165233/074555285/074588885/074555585/074555555/077777777","000001111/000000111/023333314/033551314/535551114/555555567/566666667/566888867/568888877","000000010/222020000/222223333/424425333/444455336/777445333/774455558/774455888/777555588","000001111/020000011/022220031/111111011/444441115/445555555/466665577/466665577/466867777","000001122/003000222/033220022/033322222/334325555/334425555/344466656/347466666/777778666","000000000/012222203/011242233/001242223/000044423/055003333/055677773/555555733/555885555","000011122/001001122/011111122/334442225/633345555/733344555/774444454/777774444/777877744","000000000/000012220/031412220/031111220/031551666/031551666/055511766/557578776/557777776","000000000/000102234/011122334/051122334/011133334/066173344/066663344/086888344/088883333","000000000/011111111/012112222/112222344/112244444/122254666/155555556/555577786/555777666","000000000/100022333/400023333/440022533/444442236/447766266/447762286/747668886/777666666","000000000/100222202/100003222/114503322/144403333/114406663/117700666/777770086/777700666","000000011/022000001/324411101/322451111/332466111/332446667/322246666/322666626/382222226","000000111/000001112/000333111/333333114/355311114/365554714/368554414/368854414/388888444","000000111/022220111/032000011/022441111/024451115/444555555/466557777/467777777/466687777","000000000/000000110/203200140/222241140/222444444/222455466/222555576/825577776/555566666","000000000/001100002/031100002/031333342/033355522/066657522/006885522/088855552/088885522","000000000/001111111/002222211/000032111/044552221/444566661/444555661/777557766/787777666","000000000/010022220/333322240/333332440/335333340/555666640/555555666/555777787/555777777","000000000/010102334/011103334/015554344/015554444/015555556/011577766/081577766/006666666","000000000/011100222/311300224/313300254/333300444/336660444/666600074/666770074/686777774","000000001/000220211/000222213/002222111/002422111/044425551/647775588/447775888/444445888","000000011/022034001/552234441/522333641/522233644/555236647/852236644/555333666/533333336","000000011/200033111/224435166/322431167/322431777/333331771/311111111/338888881/333331111","000000012/000001112/033331112/333111222/333144222/353644265/355666665/375555555/333333385","000000012/300040112/333341112/553444442/533444662/544466622/577767662/555777766/557777768","000000112/003300011/004330111/553330161/553530666/555530776/558737776/858777776/888766666","000001122/011111112/000133332/001111333/444113335/444413665/444443365/447646665/866666555","000000000/000111220/000122222/011111321/044441111/054461166/054461676/044861666/088866666","000000000/000111230/011111220/014411222/015441122/015555555/555566655/555766655/777788665","000000000/001023333/044425535/044625555/042622555/042222555/044772885/004777785/444444444","000000000/001111110/001111212/001311222/041355266/041356667/011356667/118356667/166666666","000000000/001122340/001122240/005112440/005511400/555661477/885666777/885886776/888886666","000000001/002200033/002220033/045000333/044060003/044466633/747776888/777666688/666666668","000000112/003031112/003331222/033331425/000041422/607044442/707088444/777088888/700000888","000001111/000222311/000241111/022241114/002444444/222555544/266777555/226677755/666687775","000000000/000101011/220111111/223333314/522223314/555555566/757777576/777777776/788888866","000000000/000112220/001112334/041222334/044444444/056664444/055664444/077664844/076664444","000000000/000123334/500113444/511133464/555166664/555167777/555111177/855555557/888888777","000000000/001102223/001444423/004433333/004444443/054466773/088446673/088488663/888886633","000000001/000021111/003324411/005333311/005551111/005555511/655557558/555577578/555577777","000000001/020033311/000000311/033333311/333433351/674444551/677744458/667777455/666744455","000000011/000000001/000222301/222224001/522644011/222640001/772668000/772688880/772688800","000000111/001111111/011122111/013332111/013332241/566666244/566444444/566474477/586777777","000001111/000011112/300000111/333330111/334335567/334455577/444558777/444888877/444488877","000001111/002011334/202001133/222055533/222553333/226657333/266655333/222665588/666688888","000000000/000001233/040111222/044111122/044455122/046444122/046444172/066884172/066664111","000000000/000110002/003100004/003334004/033444444/055555555/055556665/777566555/778866666","000000000/000111102/011113302/014155602/004455652/004455552/077422222/072228822/022888882","000000000/000111222/033131112/043335562/044355552/045555777/055575577/088575777/007777777","000000000/001111110/011234415/011255455/012265555/077266666/022288886/022888226/222222266","000000000/010020345/010023345/016623445/066623755/088627755/086627755/066777755/066777777","000000000/010222330/111223340/222222240/256277240/656278840/656277740/666274440/444444440","000000000/011102220/111202233/222222333/244222533/246662533/247662553/247662353/777866333","000000001/002334001/022244411/055211111/005211111/005555551/600577558/000577558/555557777","000000011/220330114/120350144/120351164/155555164/111111164/177116668/171166166/171111116","000001111/022221221/023222221/423222525/433522555/443555555/433555556/773538886/733333366","000001111/222000011/222033113/224443333/255543666/555543366/555547336/555544666/555584666","000000000/000112003/011122223/012224423/012244555/012246555/017246555/017266666/007778666","000000001/002033111/042225511/044222111/004411111/004444411/600444447/000444447/444448888","000000001/122223331/124423311/144522311/144522211/145551111/111111611/178876611/177776666","000000000/011111112/333314112/334314222/334444522/367455522/665555522/665558222/665522222","000000001/203333400/233544440/234446640/233666770/222266777/222266677/228222777/888882277","000000011/222000111/232222221/233444421/233333421/222333451/622633455/666673557/666877777","000000122/000000122/000334112/033331155/333631557/833655557/836655557/888666657/888887777","000000001/022200001/022203011/022433311/522222226/722278666/777778666/877788886/888888666","000000001/022322201/042221101/044225111/004455151/044445551/000006657/006600655/806666665","000000112/030001122/430511112/430555512/430556222/430536622/435537777/335333333/333338333","000000000/000012333/450222333/400223333/403333333/403666377/400066777/400467777/444467787","000000000/010002223/010022444/014444454/010005556/000755556/066666656/066686666/088886666","000000001/222000301/222043311/205043311/200043617/280043616/283043666/283333336/288888886","000000010/202030000/202033333/222034434/522033444/522233444/526266664/526676684/666666884","000000012/030400022/334400222/534402222/534222422/554444462/577477666/574477766/577776668","000000111/234111111/334151111/344111661/334177766/344177668/344176688/441176688/441778888","000011122/033001112/333004412/533344412/555366447/533366666/538866666/338868866/388888886","000000000/000110022/030415002/030015662/031115562/033335666/733338866/688888866/666666666","000000000/001223330/000233435/002234465/072234465/077733465/007774465/088774565/555555555","000000000/011020333/014425553/011423553/013333333/013667771/011166611/081116111/011111111","000000000/012220334/052200034/055222224/056224444/056677444/556667774/666687774/666664444","000000001/002034111/022244411/005211411/005111111/005555511/605557588/555777558/555557777","000000001/002100111/002111113/022444133/024444133/522467777/222467668/222466668/222468888","000000001/002234111/022234411/005221111/005111111/005555511/600577558/000575558/005577777","000000001/023000011/023345011/022344416/000334416/700333418/700013118/707711188/777778888","000000001/200033311/004443311/044456333/045456667/055555677/555588666/555886666/555888666","000000001/220001111/200033411/205003331/255555531/265771111/266671111/266671888/266666666","000000111/020020011/022223041/055233441/055253341/005553344/605553334/666667884/666666884","000000111/200011111/200033331/242003551/222033551/262073555/862003355/866600355/888660355","000000000/000012111/033311114/034444444/033344444/000345555/066347855/066347775/666677777","000000000/001010020/011112223/041552253/041155553/111115663/177115633/176616633/776666688","000000000/011000234/011555534/011155534/011333334/016773774/016877744/016674444/016666444","000000000/011023330/011114433/005113333/005333333/005555536/700558556/000558556/055558888","000000000/000111112/000133442/055133344/051166444/011116664/071118884/011188884/001111144","000000000/001101222/034111112/033555122/033655522/076666522/077776662/088766662/088866666","000000000/001220333/001114453/004144453/004444553/066655577/000665557/606666667/666688887","000000000/010000222/311102242/315604442/355607842/333607844/333607644/633666664/666666444","000000000/010222344/010222244/110004444/100000554/111066654/000067655/008066666/008666666","000000000/000111122/000111222/001133222/000443352/000644355/708683335/708883555/008833555","000000000/001023330/011022240/111111140/155555140/115566444/555567744/554888774/444444444","000000000/001023444/011122444/012222444/012255554/012657744/012647774/012444444/000008884","000000000/001111111/200111111/222233331/344435556/344437776/334438666/334438888/333338888","000000000/011111111/012334451/002344451/002367451/022367451/028366451/008336451/333355551","000000000/011112222/011122342/001522344/061552347/061557377/061157777/066155887/666665577","000000000/011122230/014124230/044144330/044444433/555444633/575556663/577758863/555555553","000000000/000001203/040501233/645500233/644770243/647720243/447222243/444422444/448444444","000000000/001233334/001234344/011244445/011266775/011266677/022266667/022222267/888222667","000000000/001122330/011442550/001142550/000145540/060144440/066144470/667177777/667778888","000000000/011200345/012244445/062444555/062247577/066447777/066647777/068847787/066888887","000000000/010020033/011222243/051622443/051662733/055566733/057888733/077787733/077777333","000000000/011010222/031110222/011445662/017445562/017455562/011444462/014418444/011111111","000000000/011111234/000012234/004412444/000442244/050644444/050077444/058000004/558888800","000000000/011120333/014120053/044220053/664720553/684420003/888422333/884422232/888442222","000000011/220330111/200433111/003333331/333555511/355556555/377756555/376666658/377776666","000000000/110000223/100440003/005540663/055500633/007555666/007555886/707777888/777888888","000000000/001112302/004512222/004512266/004512666/044555556/007778556/707778556/777778888","000000011/000220113/022200003/444222400/564244400/564444770/664488800/666444800/666666888","000000111/000231111/002222111/441111111/455661111/445661777/445561877/655561877/666666888","000000001/222000001/324566601/344460001/333461111/334466661/333666661/777688861/777777888","000000011/000223014/000222214/050661214/050061114/055661144/555671188/555671778/556677778","000000011/233303444/232333554/222366554/233366654/222777644/777744664/447744444/444444888","000000001/020111101/020133111/020333111/220333341/220353444/260077774/266088774/266688884","000000000/000122333/010123343/011123443/055111144/065557444/066657444/000057474/008857774","000000000/011112222/010112222/000003322/440403332/544400032/554666633/554467338/555667888","000000011/000222211/000021111/000221113/040023333/544026677/544028667/545022667/555066667","000000000/000100220/303100220/333111120/111111420/155514426/175514426/877664626/887666666","000000000/001122223/001222233/001222444/101224456/111124456/171824556/171824456/177777766","000000001/011101001/021111111/022213331/000014333/555044443/556047483/556887788/556688888","000000011/000002111/033332211/333442255/333422256/334444456/344476886/344476666/337776666","000000011/020000001/222201111/232200111/332220444/333320544/666770555/676700855/677778885","000000001/220031111/222033131/444043335/464446355/466466557/466465577/466468877/666668887","000000111/222220113/202200133/200003333/222203443/556244473/556644473/588664473/888866677","000001111/202201133/200204433/202200443/202225544/222665554/777655444/766658888/766666668","000001122/000003122/004403111/000443333/044443533/444645555/777655588/776658888/766666668","000000001/220031111/222033444/555003334/565553344/565566447/566564477/665568477/666668887","000001112/003301222/000304422/303300442/303335544/333665554/777655444/776658888/766666668","000001112/033301122/030001222/333004444/300005554/333666544/376655544/777658888/777666668","000001112/033301122/030001222/333004444/330056664/330556444/375566444/777568888/777555558","000000001/222031111/422033311/444053366/445553336/455456666/445457777/544458777/555558888","000001112/333001122/300000222/333330442/300000044/333506644/777566668/775568888/755555558","000001111/222001133/220000333/222220444/200000044/222506644/777566668/775568888/755555558","000000001/222031111/422033311/444003335/446663335/466465555/466467777/444468777/666668888","000001112/333001122/330000222/333330444/300000544/333665544/777655558/776658888/766666668","000000111/202020113/202020133/222023333/222022443/552224463/557844463/577888463/777888666","000001112/333301122/330001222/330004444/300055664/300556664/375566444/777568888/777555558","000001112/333301122/330001222/333304444/300005544/300665554/376655544/777658888/777666668","000001111/222201133/220000333/222220444/200000544/220665544/777655558/766658888/766666668","000001112/333301122/330001222/333304444/300005664/333555644/375566644/777568888/777555558","000001112/300301122/300304422/300300442/303335544/333635554/777655858/776658888/766666668","000000001/222031111/422033311/440053336/444555336/455556666/455457777/444458777/555558887"];
  /* </SHAPE_BANK> */

  /* <CAMPAIGN_SOURCE> */
  var CAMPAIGN_SOURCE = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,281,282,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,321,322,323,324,325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,341,342,343,344,345,346,347,348,349,350,351,352,353,354,355,356,357,358,359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,375,376,377,378,379,380,381,382,383,384,385,386,387,388,389,390,391,392,393,394,395,396,397,398,399,400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,419,420,421,422,423,424,425,426,427,428,429,430,431,432,433,434,435,436,437,438,439,440,441,442,443,444,445,446,447,448,449,450,451,452,453,454,455,456,457,458,459,460,461,462,463,464,465,466,467,468,469,470,471,472,473,474,475,476,477,478,479,480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,495,496,497,498,499,500,501,502,503,504,505,506,507,508,509,510,511,512,513,514,515,516,517,518,519,520,521,522,523,524,525,526,527,528,529,530,531,532,533,534,535,536,537,538,539,540,541,542,543,544,545,546,547,548,549,550,551,552,553,554,555,556,557,558,559,560,561,562,563,564,565,566,567,568,569,570,571,572,573,574,575,576,577,578,579,580,581,582,583,584,585,586,587,588,589,590,591,592,593,594,595,596,597,598,599,600,601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617,618,619,620,621,622,623,624,625,626,627,628,629,630,631,632,633,634,635,636,637,638,639,640,641,642,643,644,645,646,647,648,649,650,651,652,653,654,655,656,657,658,659,660,661,662,663,664,665,666,667,668,669,670,671,672,673,674,675,676,677,678,679,680,681,682,683,684,685,686,687,688,689,690,691,692,693,694,695,696,697,698,699,700,701,702,703,704,705,706,707,708,709,710,711,712,713,714,715,716,717,718,719,720,721,722,723,724,725,726,727,728,729,730,731,732,733,734,735,736,737,738,739,740,741,742,743,744,745,746,747,748,749,750,751,752,753,754,755,756,757,758,759,760,761,762,763,764,765,766,767,768,769,770,771,772,773,774,775,776,777,778,779,780,781,782,783,784,785,786,787,788,789,790,791,792,793,794,795,796,797,798,799,800,801,802,803,804,805,806,807,808,809,810,811,812,813,814,815,816,817,818,819,820,821,822,823,824,825,826,827,828,829,830,831,832,833,834,835,836,837,838,839,840,841,842,843,844,845,846,847,848,849,850,851,852,853,854,855,856,857,858,859,860,861,862,863,864,865,866,867,868,869,870,871,872,873,874,875,876,877,878,879,880,881,882,883,884,885,886,887,888,889,890,891,892,893,894,895,896,897,898,899,900,901,902,903,904,905,906,907,908,909,910,911,912,913,914,915,916,917,918,919,920,921,922,923,924,925,926,927,928,929,930,931,932,933,934,935,936,937,938,939,940,941,942,943,944,945,946,947,948,949,950,951,952,953,954,955,956,957,958,959,960,961,962,963,964,965,966,967,968,969,970,971,972,973,974,975,976,977,978,979,980,981,982,983,984,985,986,987,988,989,990,991,992,993,994,995,996,997,998,999];
  /* </CAMPAIGN_SOURCE> */

  function campaignSource(campaignLevel) {
    var source = CAMPAIGN_SOURCE[campaignLevel];
    return source ? source : campaignLevel;
  }

  var FALLBACK_SHAPE_SET = null;

  function fallbackShapeSet() {
    if (FALLBACK_SHAPE_SET) return FALLBACK_SHAPE_SET;
    var set = {};
    var n, list, i;
    for (n in FALLBACKS) {
      if (!Object.prototype.hasOwnProperty.call(FALLBACKS, n)) continue;
      list = FALLBACKS[n];
      for (i = 0; i < list.length; i++) {
        set[canonicalShapeKey(list[i].regions)] = true;
      }
    }
    FALLBACK_SHAPE_SET = set;
    return set;
  }

  function usedShapesForSize(n, exceptLevel) {
    var used = {};
    var lv, p, spec, compact;
    for (lv = 1; lv <= TOTAL_LEVELS; lv++) {
      if (lv === exceptLevel) continue;
      spec = levelSpec(lv);
      if (spec.n !== n) continue;
      compact = SHAPE_BANK_COMPACT[lv];
      if (lv < exceptLevel && compact) used[expandCompactShape(compact)] = true;
    }
    for (lv in levelCache) {
      if (!Object.prototype.hasOwnProperty.call(levelCache, lv)) continue;
      p = levelCache[lv];
      if (!p || p.n !== n || (lv | 0) === exceptLevel) continue;
      used[canonicalShapeKey(p.regions)] = true;
    }
    return used;
  }

  var levelCache = {};
  var playCache = {};

  function rateAndStamp(raw, level) {
    if (!raw) return null;
    var candidate = stampLevel(raw, level);
    if (!validateRegions(candidate.regions, candidate.stars) || findAnotherSolution(candidate.regions, candidate.stars)) {
      return null;
    }
    attachRating(candidate);
    return candidate;
  }

  function acceptCandidate(candidate, spec, used, opts) {
    if (!candidate) return null;
    var key = canonicalShapeKey(candidate.regions);
    if (used[key] || fallbackShapeSet()[key]) return null;
    var rated = candidate.rating;
    if (!opts.relaxLimits) {
      if (rated.singleton > maxSingletons(spec.n, spec.progress)) return null;
      if (rated.leftoverStars > maxLeftoverStars(spec.n, spec.progress)) return null;
    }
    if (opts.requireTarget) {
      var slack = opts.slack + (spec.n >= 8 ? 12 : spec.n >= 7 ? 6 : 0);
      var upper = opts.target + 7 + spec.progress * 10;
      if (candidate.difficulty > upper) return null;
      if (candidate.difficulty + 0.01 < opts.target - slack) return null;
    }
    return candidate;
  }

  function generateSourceLevel(level) {
    level = Math.max(1, Math.min(TOTAL_LEVELS, level | 0));
    if (levelCache[level]) return levelCache[level];
    // Campaign boards are verified fixed data. Re-running a heuristic search
    // at play time must not silently replace a certified hard board with an
    // easier fallback, or make a completed bank depend on generation order.
    if (SHAPE_BANK_COMPACT[level]) {
      var fixedRegions = expandCompactShape(SHAPE_BANK_COMPACT[level]).split("/").map(function (row) {
        return row.split(",").map(Number);
      });
      var fixedStars = findSolution(fixedRegions);
      if (!fixedStars) throw new Error("關卡形狀庫沒有解：" + level);
      var fixed = attachRating({
        n: fixedRegions.length,
        level: level,
        regions: fixedRegions,
        stars: fixedStars,
        palette: makePalette(fixedRegions.length, createRng(levelSeed(level, 0))),
      });
      levelCache[level] = fixed;
      return fixed;
    }
    throw new Error("關卡形狀庫缺少第 " + level + " 關");
  }

  function generateLevel(campaignLevel) {
    campaignLevel = Math.max(1, Math.min(TOTAL_LEVELS, campaignLevel | 0));
    if (playCache[campaignLevel]) return playCache[campaignLevel];
    var source = campaignSource(campaignLevel);
    var puzzle = generateSourceLevel(source);
    var out = {
      n: puzzle.n,
      level: campaignLevel,
      regions: puzzle.regions,
      stars: puzzle.stars,
      palette: puzzle.palette,
      difficulty: puzzle.difficulty,
      rating: puzzle.rating,
    };
    playCache[campaignLevel] = out;
    return out;
  }

  function generatePuzzleAsync(n, onDone) {
    var started = Date.now();
    var tries = 0;
    function step() {
      tries += 1;
      try {
        var puzzle = tryGenerateOnce(n);
        if (puzzle) {
          onDone(puzzle);
          return;
        }
      } catch (err) {
        console.error(err);
      }
      if (Date.now() - started > 900 || tries > 28) {
        onDone(fallbackPuzzle(n));
        return;
      }
      setTimeout(step, 0);
    }
    setTimeout(step, 0);
  }

  return {
    generateStarPlacement: generateStarPlacement,
    growRegions: growRegions,
    validateRegions: validateRegions,
    starsAreLegal: starsAreLegal,
    countSolutions: countSolutions,
    findSolution: findSolution,
    generatePuzzle: generatePuzzle,
    generatePuzzleAsync: generatePuzzleAsync,
    tryGenerateOnce: tryGenerateOnce,
    fallbackPuzzle: fallbackPuzzle,
    puzzleKey: puzzleKey,
    isConnected: isConnected,
    regionCells: regionCells,
    TOTAL_LEVELS: TOTAL_LEVELS,
    CHAPTERS: CHAPTERS,
    levelSpec: levelSpec,
    generateLevel: generateLevel,
    generateSourceLevel: generateSourceLevel,
    campaignSource: campaignSource,
    CAMPAIGN_SOURCE: CAMPAIGN_SOURCE,
    scoreDifficulty: scoreDifficulty,
    analyzeReasoning: analyzeReasoning,
    targetDifficulty: targetDifficulty,
    countSingletons: countSingletons,
    canonicalShapeKey: canonicalShapeKey,
    compactShapeKey: compactShapeKey,
    SHAPE_BANK_COMPACT: SHAPE_BANK_COMPACT,
    DIFFICULTY_MAX: DIFFICULTY_MAX,
    DIFFICULTY_WEIGHTS: DIFFICULTY_WEIGHTS,
  };
});
