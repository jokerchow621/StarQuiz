(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) root.Puzzle = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

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
    var score = Math.round(clamp(raw, 1, DIFFICULTY_MAX));
    return {
      score: score,
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
  var SHAPE_BANK_COMPACT = ["","0000/0001/2000/0030","0000/0001/2033/3333","0000/1112/1111/3331","0000/0011/2003/3333","0001/1111/1123/1222","00010/23000/33000/34444/33444","00000/00001/00233/44443/44333","00011/00111/11112/33311/33341","00000/10222/10322/11222/11242","00001/00002/33222/33332/33422","00001/22000/23300/23333/24333","00010/20000/00003/44433/44433","00000/00012/30222/30422/33322","00000/01020/00022/00333/43333","00000/00102/00113/41133/11333","00000/01223/00223/22223/22423","00000/00001/02311/22211/22241","00000/00001/20223/22243/23333","00000/10222/33222/33322/33342","00001/00011/20111/00311/33334","00000/00122/00222/34232/33333","00000/00122/30122/11122/14222","00000/10233/22233/22233/22334","00000/10023/10333/10333/00433","00000/01123/01222/01122/41222","00000/00112/03122/01122/01422","00001/00021/30041/00441/04444","00000/01230/11133/14113/11113","00000/00001/02222/33342/33332","00000/01203/01222/11222/41122","00000/00122/33342/33444/34444","00000/00111/00211/30001/44441","00000/01023/11333/11333/11334","00000/10023/11222/11222/11242","00011/00011/23331/23433/22233","00000/00011/21111/33333/33433","00000/01002/11111/31334/33344","00000/01102/11322/12222/12442","00000/00001/02223/42333/22233","00000/00011/22331/22221/22241","00001/00200/03333/33333/44333","00000/01232/01222/11422/14444","00000/01123/11122/12222/42222","00001/00002/30222/33322/34333","00000/12034/11334/11333/11133","00000/01022/33324/33322/32222","00000/11112/31311/33344/33444","00001/02300/33304/33344/33444","00001/00002/34422/44222/44442","00000/01112/11311/41411/44411","00000/00001/22003/22233/24333","00000/01223/11222/11222/42222","00001/00001/02011/03033/43333","00011/00011/02213/22211/42211","00000/01002/01022/33422/33322","00000/00011/20211/22231/24211","00000/00012/32222/33244/33222","00000/00010/22222/33332/33344","00000/01111/11222/13422/44442","00000/11022/22223/24333/23333","00000/01002/11342/11144/11144","00000/00012/13112/11111/44444","00000/00012/30022/33324/33222","00001/02031/42211/42221/42222","00001/22011/20011/23314/33311","00011/00021/03321/33222/34222","00000/00100/22222/23342/44444","00000/00100/21133/11133/44113","00001/22000/22222/33344/33444","00000/00111/22113/22211/22244","00001/02011/02211/22113/22413","00000/00110/22211/22231/24233","00000/00011/20031/40331/44331","00000/01002/31112/33312/34322","00001/02011/33014/33114/33311","00001/20011/22213/24211/44411","00000/01002/01303/44333/44433","00001/02111/11111/33344/33444","00000/01222/33442/33444/33344","00000/00012/30212/42222/44442","00001/00021/03331/33331/34444","00000/00010/20314/33344/33444","00000/11223/11123/14223/11133","00001/00111/00222/34322/33332","00001/00011/02231/22334/23333","00000/00111/00211/32214/22444","00000/01120/03110/33311/34444","00000/10022/10000/10333/00433","00000/00111/11112/13422/44442","00001/02031/02211/22221/24444","00000/00112/03412/33312/33312","00000/00111/02211/32114/22444","00000/01111/01112/34222/33332","00001/02111/33311/33441/33344","00000/00111/02131/22134/22333","00000/01111/21134/21333/21113","00001/02111/33331/33444/33344","00000/11112/33412/33332/33222","00000/00111/20331/22111/21141","00000/01022/01322/11333/11433","00001/23111/33141/33144/31144","00000/01203/42233/42233/44433","00000/01120/31122/31324/33322","00000/01011/21113/22244/24444","00000/01120/01333/44433/44433","00001/02001/33341/33444/33344","00000/00121/03111/33411/33444","00001/00011/22331/22331/42233","00000/00111/23111/22444/24444","00000/00120/01113/03333/04443","00000/10222/10222/10023/10423","00000/11234/12233/11233/11222","00000/00010/20113/11113/14444","00000/00110/21111/31141/33444","00001/00021/30441/33341/33444","00001/00011/02221/33224/33322","00000/01222/02232/44333/44433","00000/01110/02234/02233/22233","00000/11122/11132/11433/13333","00000/11123/14133/44433/44333","00000/11022/10002/11113/14444","00001/00021/34441/34411/33444","00000/00001/23001/33441/33444","00001/02111/33441/33441/33344","00001/00111/00112/33322/33342","00001/02111/02222/22333/22433","00000/10022/11222/13222/44442","00001/00211/03241/22244/22444","00000/01102/33142/33122/33222","00000/11112/31144/33344/33334","00001/02111/02113/22244/22444","00000/00110/02330/04333/04433","00011/00011/20031/23334/22333","00001/00001/23011/24441/24444","00011/00001/00201/22233/24233","00000/01110/11222/13242/14442","00011/00002/22222/22332/24333","00000/10223/10033/10033/11433","00000/00111/02133/04433/04433","00000/10222/13422/11442/11222","00000/10222/12222/13333/11433","00001/20011/30111/31144/33444","00001/00021/00222/33332/33432","00000/01122/11123/12224/12244","00001/00211/30211/33214/33222","00001/00011/20011/20341/22244","00001/00111/23444/33444/33444","00011/01111/02233/22233/22243","00000/11023/14022/44022/44422","00001/00011/22231/24411/22444","00000/10232/10222/10224/14444","00001/02111/22111/11131/14333","00000/00112/11112/13111/33444","00000/00010/02033/42333/44444","00000/10023/14223/44422/44442","00001/20300/23330/22433/24433","00000/10222/10323/14333/11133","00011/00011/20013/20004/22444","00000/11023/11223/11433/11333","00000/11123/11443/44443/43333","00000/00122/33111/33411/33311","00000/10222/11232/14332/13333","00000/11022/13042/11042/11022","00001/02011/22011/30044/00444","00000/00112/33122/11122/14111","00000/00011/20001/30044/33044","00011/00000/00233/44443/44433","00001/00111/00012/33114/33444","00000/01120/00120/31120/34422","00001/00011/20003/20003/22444","00011/00111/11112/33312/43312","00000/01111/02211/22334/22333","00000/11122/11113/13343/13333","00000/00102/03342/03442/00444","00011/01111/00222/30022/33342","00000/01112/01222/02232/42233","00000/01223/02233/02444/22244","00000/11233/13334/13344/13333","00000/10022/10000/11030/14433","00000/11022/10022/10003/10443","00001/00011/02001/22034/22334","00000/01023/01333/01334/11334","00000/11122/33323/43333/43333","00001/00001/22302/22222/22444","00011/00011/20333/20004/22004","00000/00011/20111/20033/24033","00000/01123/02223/04422/00022","00000/01102/00002/03004/33444","00000/10222/30022/33042/33042","00000/01102/03102/03302/04444","00000/01022/01033/04033/44033","00000/10122/11111/11311/33344","00000/01102/01332/11334/11344","00011/00000/00002/30442/30222","00000/00100/00122/03111/33444","00000/00100/02103/22243/24443","00000/00011/00211/30222/32244","00001/02221/00221/33244/33224","00000/00011/23314/23314/33333","00001/00011/02000/22033/24443","00001/00021/33221/33344/33344","00000/00011/20331/20011/00044","00000/01020/01324/03344/03333","00001/00221/22233/22222/24444","00001/00011/20003/20003/44403","00000/00010/21111/22334/22444","00001/00011/02000/22034/33334","00000/11112/11112/13144/13111","00011/00000/00020/33322/44422","00001/00011/20001/22223/44433","00000/00010/20010/20334/20044","00000/01022/01000/11103/44443","00000/00011/22311/22334/22224","00000/10002/10332/10033/10044","00000/01102/03002/03300/33440","00000/01122/00112/00322/44333","00000/00102/00102/03100/33440","00001/20011/20013/00413/00444","00000/00120/30120/30220/34422","00000/00010/21113/24433/44444","00001/00001/02021/32222/32444","00000/01111/01112/31442/33332","00000/00122/01111/03334/03334","00000/01102/01102/11133/44333","00001/00011/02001/22003/44403","00000/10022/10003/10003/11443","00001/00011/20021/22223/22443","00000/00112/02222/03222/03442","00001/20011/20011/00333/00344","00000/10203/10203/10244/12224","00011/11111/12314/22314/33314","00000/00122/01112/03222/33444","00000/10233/10224/10024/12222","00000/10233/10243/10443/00044","00001/23301/24000/44000/44000","00011/00001/00002/33332/44333","00000/01123/04423/04223/02222","00000/10223/10023/44222/42222","00000/00110/20340/20340/20444","00000/00122/00111/30141/30144","00000/00122/30114/30114/00111","00000/00111/11112/33322/33442","00001/00011/02001/02234/22334","00000/10233/10233/10333/10443","00000/00120/31120/33144/33333","00000/00011/23111/23441/22222","00000/00100/11122/33124/11144","00001/02211/02234/02234/33334","00000/00010/22210/23310/22244","00001/11111/12111/32444/32244","000000/001120/001120/331120/333422/533222","000000/000122/034112/334312/353312/333312","000011/000112/003113/443333/443355/444355","000000/010223/011122/111452/144442/444222","000000/011022/013432/013333/111133/115133","000011/000012/111113/445133/444433/444333","000011/020001/220031/244455/244555/224445","000001/220031/200001/241111/241551/244444","000011/000111/000213/442211/444221/444251","000000/000011/000211/302214/555244/522244","000000/000122/003112/033312/043332/444532","000000/011122/012222/000322/450024/444444","000011/002211/000211/333222/334542/334444","000011/230000/233333/224333/224335/444333","000000/011022/011322/013322/333242/335222","000001/002011/310011/411111/411115/445555","000000/000123/001133/003333/044535/555555","000000/000123/011133/041135/041133/444333","000000/000111/011112/034152/044452/044442","000000/012222/112344/112544/115554/555544","000000/001233/011434/014434/115444/144444","000001/000111/021111/023344/023344/225333","000000/000011/002311/042221/444225/445555","000000/000122/011132/013332/111342/155332","000000/000011/222221/233311/233341/225311","000000/110233/100334/100034/155004/555544","000011/000001/222331/422231/443335/444433","000000/000111/023441/023445/024444/022244","000011/200111/220111/223333/423333/422253","000000/011110/011112/033311/333344/335555","000001/022001/222300/444400/455000/550000","000000/001222/011222/112233/114433/154333","000000/001122/001122/303455/333555/333555","000000/001022/001134/303334/333344/335444","000001/002111/322111/322441/335444/333444","000001/211101/333111/443151/433151/433555","000000/000011/000211/344222/333332/335222","000000/000011/223331/222331/244331/444531","000000/001120/111122/133222/444442/454442","000000/001111/022311/023334/024454/224444","000012/003212/000222/444255/455555/444555","000000/001022/011123/114423/154223/111123","000000/001002/031044/034444/035555/333555","000001/200111/221111/222231/425533/555333","000001/023221/022211/024411/444511/444555","000000/001002/111102/133322/133425/555555","000000/011022/310022/114522/111552/111552","000011/220111/230111/240555/244445/444555","000011/000011/002013/242213/222233/552233","000000/000012/034542/334542/334442/334222","000000/010222/110332/111332/141332/113352","000000/010222/011332/111332/144432/444532","000000/100023/110224/100544/105554/555444","000000/011123/001223/101223/111443/115333","000000/000010/223014/333344/333444/353334","000011/200001/222211/233334/233333/333553","000001/001111/211111/223444/223454/244444","000011/021111/031111/333333/344444/444554","000000/011123/111122/411112/444422/445444","000000/000111/230441/330444/355544/335554","000000/010222/330244/334444/333335/355555","000000/011123/014422/014122/011112/115552","000000/001110/021330/041344/044444/055555","000000/001122/011113/013143/033333/333555","000000/001222/001122/011332/444433/444453","000000/011111/000221/030421/030441/335441","000000/000112/300122/111142/551144/111111","000000/001220/001233/401233/401253/400233","000000/001123/001122/044425/044455/445555","000000/000111/002211/034251/044255/004222","000001/002033/222333/244445/244255/222225","000000/011102/331102/311402/353402/333302","000000/100022/133324/333324/344454/344444","000000/000011/022231/042231/055331/055531","000011/000111/234151/224151/224155/444155","000000/001122/001111/033441/033441/333544","000000/010233/010233/014223/012253/015555","000000/001122/001112/001134/051444/555444","000000/000112/031112/031142/035112/035555","000000/000110/222111/324411/524444/555554","000012/000002/033022/333000/434445/444555","000001/222201/322111/332211/344222/333522","000011/000111/200111/304155/304555/334444","000000/000111/220131/222331/242333/444453","000000/000012/003312/043312/053312/055322","000001/202333/222333/224443/555443/554443","000000/000001/023441/024451/024555/224455","000001/220001/220331/422221/424521/444422","000111/000112/300222/330242/534442/333444","000000/000112/001112/003132/043332/555555","000001/021031/221111/222222/224554/224444","000001/200011/220331/420311/220351/220555","000000/011123/001122/000122/404552/444555","000000/011022/013342/113542/133342/133442","000001/022011/032221/032221/433311/433335","000000/000110/201111/201134/555133/555533","000001/111111/122223/124223/125553/155333","000001/002111/322111/224155/244445/255555","000000/001123/001433/444433/333333/555533","000001/201111/331111/331455/344455/345555","000000/001111/002221/034444/334454/334444","000011/002011/032111/332214/532214/331114","000000/001122/001112/031422/331222/322255","000000/011002/013344/111344/533354/555554","000001/203111/203111/233141/233155/333355","000011/001111/021111/222333/245343/244443","000001/000111/222111/223111/223334/555533","000001/022221/342221/344222/335222/333222","000000/001111/200341/204445/205545/205555","000000/000111/000211/030000/330040/335544","000001/000111/000112/030011/333441/555444","000001/001111/201334/551434/551444/554444","000011/000111/233141/233145/233144/223144","000111/000112/030000/334440/344455/334445","000000/110222/132222/133222/133455/133555","000011/000112/000222/300224/333224/533444","000000/011223/011233/042233/222255/222555","000000/001112/011132/003332/043333/555533","000000/001122/301142/331442/233222/222252","000000/001111/023441/023444/223354/223344","000001/220331/200311/233333/333444/333544","000001/000201/300000/334055/334055/333055","000000/110011/111112/333412/333411/444455","000000/012203/415203/115253/155555/115555","000011/000221/000011/333333/334444/334454","000000/011002/013222/113455/533335/555555","000000/012003/012044/012044/012555/222555","000000/001122/031111/034444/054444/055544","000000/000122/022222/034455/033355/033335","000000/102222/103422/103332/003555/055555","000000/110222/330022/333224/333444/334445","000011/000111/020031/220333/220434/250444","000011/222013/224013/250011/255011/555001","000000/001120/111222/134255/133555/135555","000000/001112/003222/402252/402255/400222","000001/202203/222333/222334/533334/554444","000000/000001/022301/422000/444550/440000","000000/000111/000211/330222/334442/444452","000000/000111/023114/022514/022554/055554","000000/000112/000111/030001/333455/344444","000000/011233/042233/042222/544222/444222","000001/220101/000111/030014/030555/330055","000000/001122/031122/011114/044444/055444","000001/022231/042332/042222/002222/500022","000010/222000/222033/444533/445553/444455","000000/011112/001312/043332/044432/444522","000011/000011/223000/423020/222220/555522","000000/011203/114433/414333/444533/445533","000000/010223/011123/012222/042222/222555","000000/001110/201310/221340/225330/555333","000000/011110/011112/013122/033144/055544","000000/011002/111022/133004/133504/334444","000000/102034/105034/115034/155554/155555","000000/010234/011234/000034/055334/053333","000001/022331/222311/242335/243325/222225","000000/011111/002331/003331/403331/445555","000000/010222/010333/010443/055443/003333","000000/001011/001112/033412/033412/553332","000000/000110/022213/033333/034453/033353","000000/000100/011122/034122/034452/033355","000000/011112/011112/011333/041335/441155","000000/011102/031102/031142/055444/044444","000000/011111/111222/133324/135544/333333","000000/010022/013222/033442/034445/033335","000000/011112/011122/111333/144335/114455","000000/001111/223311/222111/224411/244551","000011/000221/300221/300001/304405/333305","000000/010002/110332/111322/141333/145555","000001/000011/020013/420013/422213/445513","000000/011002/011022/034025/034455/055555","000000/010222/010223/012223/045553/044333","000000/100022/111022/131004/333004/355000","000000/001023/001423/551422/454442/444442","000000/000110/021110/023340/053340/555444","000000/110222/000020/030000/030440/333455","000001/000001/222111/322333/333344/555544","000000/000011/002003/442203/455205/445555","000000/000111/200011/233455/224445/222444","000011/002211/333331/444433/454443/554333","000000/011112/031412/531412/551112/111111","000000/011022/010023/040003/045503/055333","000011/000001/022201/033201/433305/444335","000000/011111/012231/033331/003341/055544","000001/000111/200031/200033/244005/444005","000000/000112/033332/033242/055242/022222","000000/111122/131224/232224/222222/222255","000001/001111/000022/330224/300554/305555","000000/100022/133042/113442/111452/111452","000011/220001/222000/220003/220403/554443","000000/000012/300112/304412/304002/300055","000000/100002/100222/000232/040332/444555","000000/000112/001112/031144/031554/335554","000000/010223/014423/011122/015552/115555","000000/011222/011122/011132/041333/441555","000001/002201/322224/322244/335555/333355","000000/000111/011123/044423/045422/045222","000000/110222/130022/430522/433552/455552","000000/001110/221111/233311/222341/255344","000000/000011/020331/022231/002244/005544","000001/000011/221111/222213/244223/244555","0000011/0200111/0230111/2245116/2445116/2446666/2244666","0000001/0011111/2000311/2200341/2233344/2255654/2555554","0000000/0011111/0012213/0442223/0002533/5622553/5555533","0000011/0011112/3011112/3334422/4344425/4444222/4466662","0000000/0011002/3114002/1154002/5550002/5556000/5556600","0000111/0200211/2202211/3222244/3352464/3332464/3332444","0000000/0100222/0111222/0133242/0335442/0335446/0344444","0000000/0000001/2000000/2304444/2300054/2300444/2266666","0000000/0100111/0111112/0333312/3334442/3335422/3633222","0000000/0001111/0002221/3022222/4044442/4445452/4465555","0000000/1112223/1442222/5544422/5564224/5444444/5555444","0000000/0001233/0001113/0004133/5561133/5561133/5666113","0000000/0122343/0122333/0155633/1156666/1111166/1116666","0000001/0002001/0322211/0333241/3355644/3555544/3355555","0000111/0000001/0002222/3444222/3544444/3333434/3363334","0000001/0000111/2001111/3304411/3354441/3344446/3366666","0000011/0000111/0021111/3024441/3034444/3335564/3335554","0000000/0102320/1102222/1102224/1105544/1505444/5555446","0000011/0201111/2222311/2233331/2333444/2224445/2624444","0000011/0022221/0000021/3045622/3355622/3355622/3356662","0000001/0011111/0022111/3032211/3333214/3333555/3365555","0000001/0200301/0444301/0055301/0055301/5555303/5565333","0000000/0010002/3411022/3111022/3355052/6355555/3335555","0000011/0001211/0111113/0144443/0154443/1155533/5556533","0000001/2003111/2222111/2222411/2552444/6554444/5544444","0000000/0102304/0102224/1112254/6111244/6162244/6666664","0000001/0222011/0022231/2224233/3333333/5555333/5565333","0000001/2200111/2200011/0000013/0343333/0333533/0635555","0000000/0102222/0102222/1122344/5116644/1116664/1116666","0000000/0000101/2001111/2231114/2531116/5551666/5555666","0000000/0111213/0411113/0411133/0433113/0053333/0666666","0000011/0021113/0221333/0221343/2221553/2265553/2255555","0000000/0012203/0012403/0115433/0155443/0165553/1111113","0000001/2200221/2222211/3333311/3333411/3444415/3644444","0000011/0012111/0011113/4055553/5556353/5566333/5566663","0000001/0000021/3004111/4444155/4555555/4465556/4666666","0000001/0002111/3002221/3302224/3352566/3555566/3355556","0000000/0000111/0000231/4052233/4056233/4052233/0055555","0000000/0012220/0112330/0112340/0522333/5552333/5556333","0000001/0020033/0224533/0244336/2243366/2244466/2244666","0000011/0002221/0000333/0444333/0044333/5444436/4444336","0000001/2220111/2220111/2300451/2660451/2600555/2665555","0000001/0200331/2224111/2522111/5555516/5555116/5666666","0000001/2003111/2233311/4433331/4433531/6455511/4445555","0000000/0010220/0314522/0114522/0155562/1156662/1666666","0000001/1111111/2222211/2324555/2325555/2335565/3355555","0000011/0220011/2200331/4220311/2220333/2525333/2555633","0000000/0001111/2211111/2213331/4223311/4243551/4445556","0000000/0010233/4000233/4402223/4002333/4442335/2222655","0000000/0001100/2000003/2403333/2403333/2444335/2226555","0000000/0001022/0311122/0334222/3344452/3346555/3445555","0000000/1022203/1002203/1444223/1145533/1145553/1145653","0000000/0000011/2333341/3353541/3355541/5556541/5555541","0000000/0000011/2033111/4003311/4433111/4435551/4446555","0000000/0100230/1140222/1150622/1550626/1150626/1000666","0000001/0001221/3311111/4333111/4433151/6443155/4443111","0000000/0011233/0041113/0441433/5544433/5545333/5555563","0000000/0010220/1110322/1410562/1000562/1505566/5555566","0000001/2003111/0003314/5503334/5000334/5333334/5556344","0000000/0001112/3011111/3014444/3000454/3005555/3333366","0000000/0012220/3011330/3003340/3333440/3356666/3336666","0000001/0023301/0223111/4333131/4433333/4443335/4444633","0000000/0011111/1111222/1113422/1333556/3335566/3336666","0000111/2300111/2002114/2222114/5522144/5522246/5224444","0000001/0222201/2203201/2000004/5050044/5555044/5655554","0000011/2000111/2020111/2222344/3333344/3333345/3365555","0000111/0002221/0322221/0324411/3324445/3633445/3333555","0000011/0002021/0302221/2222111/2455516/2441116/1111666","0000001/2000000/2223444/5222464/5224466/5554666/5554466","0000000/0000011/2200111/2203311/2224353/2424333/4444633","0000000/0011111/0222331/0333331/0443533/0444555/0465555","0000111/0000011/2220111/3322111/3333144/3555144/5556144","0000011/0000111/2220111/3324111/5321155/5555555/6666555","0000000/0111233/0111333/0001344/0501664/5566644/5566444","0000000/0000012/3344012/3344552/4344452/4442222/4622222","0000000/0102033/0104443/0104333/0111133/0556666/0555556","0000011/0022111/3000111/3301111/3311145/3336555/3666555","0000011/2201111/2200331/0000031/0445533/0444433/0004463","0000000/1100233/1100033/1111111/1145516/1444516/1455566","0000011/0001111/0221333/0221333/2244553/2264455/2244455","0000000/0120033/2220033/2420553/2420056/2440056/2400556","0000000/0011110/1112213/4122513/4122611/4444611/4446666","0000011/2001111/2001111/2233333/2223443/2254444/5555564","0000000/0001110/0001123/4001553/4611533/4666333/4446333","0000000/0000112/0340562/0345562/0345222/0344242/0444444","0000000/0102333/0145663/0145563/4145666/4446666/4444666","0000000/0011102/0001322/0400025/0444425/0666665/6665555","0000001/0022011/0222001/3322241/3322444/3355545/3336555","0000001/0000011/0002223/2222223/2442555/2465555/4444455","0000012/0300011/0340111/0330111/3330111/3550066/3555566","0000000/0102222/1102222/3222332/3445333/3433333/3336663","0000000/0000111/0022131/2222231/2224221/2554461/4444661","0000001/0001111/0202211/0222213/0244433/4444533/4655533","0000000/1100022/1100332/1000033/1114453/6644443/6444333","0000000/0000011/0230441/0333441/0344444/0355544/0665554","0000000/0111022/0111023/0143023/0133033/0533336/0556666","0000000/0111002/3441222/3441122/5446112/5555112/1111111","0000000/0011100/2011333/2011334/2015333/2565353/5555555","0000011/0200001/0222222/2233334/2222234/5266636/5226666","0000000/0111112/0133411/0553466/0553366/5553366/5533333","0000000/0111111/0233413/0233313/0225333/0255663/0055555","0000001/1111111/2311111/2114441/2224444/2555544/2665554","0000000/0102222/0112322/0011124/0556644/0566644/0564444","0000000/1023333/1022334/1023344/1004444/1054544/1555564","0000000/0012220/0312454/3312444/3312444/6311114/3311111","0000000/0111222/1111112/3411512/4415512/6416512/6666511","0000000/0111222/0131244/0531224/0531244/0551116/0555555","0000000/0110223/0140333/0444443/0554443/0555643/0555543","0000000/0001100/0022100/0221103/0245003/0445006/4455666","0000001/0000211/0003221/0403321/4455326/4555322/4442222","0000001/2000111/2000001/2220301/2420311/4420515/4660555","0000000/1100233/1102233/1104223/5102223/5106223/1106622","0000000/0000112/3040522/3345552/3345562/3344522/4444444","0000000/0011020/0311024/5360044/3360044/3366044/3666444","0000000/0000111/2222111/2322441/2322451/2363455/2333444","0000000/0011111/0221111/2233411/2333411/2536441/5555551","0000000/0001111/2011343/2003333/2555553/2556666/2555556","0000111/0000121/0331121/4435121/4435522/4635222/4455222","0000001/0221111/0011311/0000344/3333344/5553334/5564444","0000000/0011112/0011132/0013334/5016644/0016444/0044444","0000000/0001023/0001223/0401123/4401223/4400053/4660055","0000000/0000010/0221111/0331441/3344411/3334555/3633333","0000001/0202111/0222113/0442566/0455556/4456666/4456666","0000011/2000001/2033331/2223211/2422211/4445216/4445222","0000000/0111111/0211113/0114453/0664453/0444455/0444445","0000111/0000111/2220113/4520133/4420636/4220666/4440000","0000012/3033002/3333202/4445222/4445566/4455566/4455666","0000000/0111120/0333324/0566344/0556344/0056644/0555555","0000011/0200011/0222313/0242333/4442235/4645555/4445555","0000001/0011111/2222314/5222314/5326314/3323334/3333334","0000001/0222233/2244433/2444333/2245333/2255333/2333366","0000000/0001223/0401223/4402223/4400333/4333335/4655555","0000000/0001121/0333111/0333311/0435111/0335661/3355566","0000000/0110223/0410223/0444533/0000533/0055555/0655555","0000000/0102332/0102222/0104444/0504444/0555464/0555564","0000001/2200001/2303101/2333111/2344441/2444511/2644555","0000111/0210113/2211133/2224443/2444444/2255545/5556555","0000000/0011102/0031102/0444102/0544502/0555552/5555662","0000000/0110220/0122233/0023333/0425336/0423366/2222266","0000000/0110002/3411222/3511222/3555626/3555666/3333666","0000000/0011234/0011234/0011133/0555553/0563333/5566666","0000001/0000200/0222230/0222220/0242555/6642555/6662255","0000000/0000011/0023411/0224451/0004451/4004455/4444665","0000000/0010222/1110032/1140332/1440333/1450363/1453363","0000000/0011112/0000222/0000342/5633344/5335334/5555344","0000011/0222313/0233333/0233334/0244444/5664444/6664444","0000001/0221111/0221341/0233331/0555111/0055111/5555166","0000001/0002001/0022033/2022033/2222443/5666643/6664444","0000000/0001110/2011133/2211433/5241443/2244466/2222266","0000000/0001112/0111232/0144222/0544622/0546666/0555556","0000001/0200011/3330014/3350111/3555661/3566611/5555666","0000011/0020001/2322201/2322201/2222204/5522204/6660004","0000001/2000111/2000311/2000311/2240111/4444115/4466655","0000001/2023400/2023433/2023333/2222233/2556633/2566663","0000001/0000011/0201111/2201134/2205134/6006334/6666333","0000000/0111223/0454423/0454623/0454622/0444222/0444442","0000000/0000011/0002221/0302224/0332444/0532646/0533666","0000000/0110222/0222223/0244233/0546333/0546663/0443333","0000000/0000012/0324412/0322222/0225566/0225555/0222222","0000001/0200001/0222222/0223345/0065345/0665335/6665555","0000000/1000023/1040223/1045523/1055222/0005526/0555566","0000011/0220001/0222331/0442335/6662235/6666635/6666635","0000001/2201111/3004441/3304441/3300011/3335006/3355506","0000000/0010222/3010222/3004422/3000022/3356662/3355522","0000011/0000111/2000313/2440333/2440533/2466553/2223333","0000000/0100222/0113332/0444352/0464452/0066552/0555552","0000000/0001100/0111122/0133111/0443151/6643155/4443155","0000011/0000111/2003111/2233333/2233455/2224456/4444456","0000000/0000100/2111133/2122134/2224444/5525554/5555664","0000000/0111122/0311133/0334433/0333335/0036635/0333333","0000011/2223441/2553444/6653344/6653444/6553333/6553333","0000000/0001022/0031452/0033455/6663445/6633444/6666664","0000000/1000223/1130223/1330333/4333353/4355553/6665553","0000000/0010222/0311244/0311111/0335566/0335556/0035556","0000012/3300012/0001112/0001122/4401115/4401665/4001666","0000000/0011222/0022222/2222233/2455636/4446636/4444666","0000000/0111123/0111223/0144223/0152233/0155553/1116666","0000000/0111223/0431333/0433333/0453363/0456666/0444444","0000000/0000011/0222211/0332241/0566244/0566244/6666244","0000000/0012223/0011113/0004133/5504113/5500003/5566333","0000000/0001123/0400223/4450203/4450006/4446606/4666666","0000000/0112233/0142553/0144533/0000553/0660053/6666333","0000001/0000021/0333321/0343111/5341155/5555555/5566555","0000000/1002222/1332442/5532244/5333234/5336633/5333333","0000000/0111220/0111323/0441323/0546333/0566633/0666633","0000011/2000011/2003000/2203400/5003440/5066644/0066444","0000012/1111112/1111122/3443122/3333125/3331125/6633335","0000000/0011100/0111233/1111244/1514224/1514444/5514466","0000000/0000110/0222222/0333332/0433222/0444252/4466652","0000000/0111023/0144023/0114222/0111222/0001252/6661255","0000000/1000023/1110023/1440553/6640553/0440533/0000555","0000000/0111203/0111243/0551244/0561224/0661222/0666222","0000000/0011022/0111003/0441003/5433333/5336633/3366333","0000000/0111002/1101002/3400002/3400502/4400402/4444462","0000000/0012222/0012344/0115344/0555334/6655434/4444444","0000001/2000201/2222233/4444223/4566623/4566622/5566222","0000000/0000112/3001122/3041552/3041555/3044445/4444466","0000000/0010022/0111113/0043333/0444533/0664553/0444333","0000000/0011203/0111223/0144222/0444442/0544446/5544666","0000000/0102003/0112003/0412203/5402003/5402063/4400066","00000000/00011122/00011333/04413333/04111333/44411353/44465555/47444555","00000001/23332001/22222001/22242111/25242116/25542116/55544666/57444466","00000000/00110222/00133244/01135224/01332264/01322264/67332264/66666664","00000000/01222222/33222222/33444422/33355442/66335442/66355542/66667555","00000011/02022001/02222211/02234411/33234411/33335416/33334416/33377666","00000000/00012333/00222343/55552443/65755444/65775574/66777774/66666674","00000001/22000111/22200113/22200455/22204445/66204445/66664555/76664555","00000000/00000011/22201111/34200151/34400551/44660555/44460575/46660555","00000000/00001222/00222233/44422223/44555333/44453336/44455537/44444477","00000000/11102222/11103222/11403222/14433555/44435555/44335655/44555557","00000000/00001000/21111110/33455500/33445506/37444506/37477700/37777777","00001111/00000001/20000331/22223311/24222315/26666315/26663315/66673355","00000000/10000233/10033334/10044444/00045555/06045755/66044755/66666775","00000000/01000010/01112013/01411113/11555513/16666613/16677113/33333333","00000012/03333222/33344222/44442225/64422225/67777255/67667755/66677755","00000011/02202012/00222222/00222232/44452666/44755566/44455666/44455566","00000000/01111111/02333331/02222431/02525511/22555561/22766561/26666661","00000001/20003111/22045111/22245111/26245711/66445771/64455477/66444477","00000000/10200033/40222333/44522333/46552333/46522237/46633336/46666666","00000000/00011102/30411222/30551262/30511266/33555226/33566666/35567666","00000011/20300111/23301111/23311456/22333455/22335555/27337775/77777755","00000000/00000011/02000311/22024111/22224441/25554444/56554777/55577777","00000000/10000222/13322222/13345552/11345555/14444655/74445555/44445555","00000001/22330011/22000111/42220111/44220151/44220151/44225556/44275555","00000000/00111120/00031220/01111220/00445220/04422260/04227766/22227666","00000000/00001111/00221333/00111333/40155563/44155663/41115666/44555576","00000000/00112333/04152223/04111233/00161233/00662223/06677773/66677773","00000001/00230004/05222224/55562224/56666624/54446664/57444444/57444444","00000011/20001113/20004511/22044515/22044555/00004555/00644455/66667755","00000000/00001111/02202111/22222113/24445513/44646613/47666633/44666333","00000001/00111111/00213444/02254444/00255544/22225444/67625555/66666555","00000000/00011022/00311122/00011222/04441552/05555562/07556562/55566662","00001111/00222131/02222131/00233331/22244335/22243335/44644455/44447555","00000000/00000120/03333122/33343111/35344441/33446671/43466611/44444661","00000000/00000112/00000012/33031112/33334122/35366662/55366666/55555676","00000001/00211111/00222113/00241113/44441413/55644413/55664443/55573333","00000000/00122344/00123343/05526333/55526636/55226636/25222666/22266676","00000000/10223333/00023333/04023333/04022355/44066355/40065755/44065555","00000011/23004111/33044151/30004451/30000055/36666055/33676655/66676655","00000000/00011222/00311212/04312212/03311115/03666777/03367767/03666667","00000011/20022211/22021111/22222134/25256664/55556664/57556664/55566666","00000122/00000222/33330242/35633342/55555542/55444444/54477777/54444777","00000111/00011111/02031334/22333344/23334444/23334546/23355566/25557556","00000000/00012303/00011333/00441133/05441114/05444444/65555554/66666674","00000010/22203000/22223330/22222233/22456633/24466666/44466777/44777777","00000011/22333011/42303011/42200015/42260115/47255115/44551155/44455555","00000111/02200311/02222311/22222344/23552344/23333344/26633347/22633344","00000011/20000111/30000111/33334111/53633316/56666666/56677676/55577777","00000000/10000223/10400253/10005553/11106553/17700353/11703333/11700000","00000000/11110223/44410222/44111225/44444255/44444225/66462255/76666555","00000010/02220000/22322220/24425555/44555555/44666555/46666675/46666775","00000001/00222022/02222223/02222333/45222263/44472663/44446663/44666333","00000000/00122330/00114330/04514430/04411440/00444460/40444477/44477777","00000000/11022233/11020243/15000244/11622242/66662222/66666662/66677772","00000001/00223331/00223311/22233311/42223111/44433115/44433666/44766666","00000111/00001122/33001111/30044111/33045511/63044444/63000000/66667770","00000000/00111112/03311242/03111222/03555266/33557266/33522222/32222222","00000000/00000111/00002311/22022441/22224451/25555551/25677751/26667751","00000000/00001122/00003224/33333224/55633244/55552224/52572244/22222224","00000000/00112222/01122232/04424452/06444455/04474775/04477755/07777755","00000000/00122222/01122333/01122333/01222343/22255343/22655553/27777773","00000000/11122221/12122111/12223311/11111114/15555644/15765664/16666664","00000000/01023220/41022220/41055620/40055660/40555550/44575770/44577770","00000000/10000022/13330024/56630224/56550274/56550277/55550227/55555557","00000001/22202303/22222333/22224443/24444444/25446664/24477766/27777666","00000111/01111111/00021111/00223311/40422311/44455515/44466555/44766666","00000011/02000131/22200111/22220441/22440455/26444455/26664555/27775555","00000001/00220111/02230114/02230155/06665155/06655555/06777775/77777755","00000111/20330011/20234445/22234646/77233666/77773366/77773336/77333366","00000000/00011223/00011223/00000423/55500622/55560662/55566622/57666622","00000000/01022223/01122333/01112333/04122355/04663355/04667655/04466655","00000122/00000123/04444122/00411122/50444222/50044627/50666677/50066667","00000000/00012345/06612345/06611344/06613344/06111334/07144444/11111111","00000011/22030001/24330031/22333331/22536631/55536666/55333776/55333777","00000000/00000011/02222221/22333321/22244331/25254441/55554461/55557466","00000000/00110222/03111232/03144332/03333352/03336552/03555552/55577755","00000001/11111111/23333311/23444111/23541111/22222221/66666622/67777222","00000000/01100022/01000032/01044552/04444552/06644472/06447777/06666777","00000011/00001111/02003111/02233341/02223345/02623744/66666744/66667774","00000000/00011112/00011222/03011232/33333334/35544444/33566664/35557664","00000111/00000221/00202211/30222214/30444444/30454544/30455566/33475566","00000012/30000112/33301122/34301522/44301556/47777555/47477755/44477555","00000000/00012233/40013333/45513663/44513633/44516633/14511733/11111111","00000000/01023330/41023330/44043300/54445000/54555600/54566667/55555566","00000000/01102222/11334552/13335552/13366677/11667777/61666667/66666677","00000000/00110223/00144423/00544633/05544333/05547337/05577777/55777777","00000000/00000120/01111122/03114442/03344452/66644452/67645452/66665555","00000001/00022111/00021134/00331134/05531134/05533334/66663334/67663333","00000000/00012222/00222232/44422332/54226632/54456632/55556272/66666222","00000000/01100233/01110234/01111234/00522244/00524444/06555444/66665474","00000011/00220011/33322114/33552211/35522222/35522266/37527776/37777666","00000001/00002001/30100111/30111144/50116644/50446444/50544444/55547777","00000000/00001111/02111133/11111333/44155553/64176563/64176663/66666663","00001112/34003512/30003511/33333511/66373511/63375515/33375555/33775555","00000000/01111111/01112344/05152244/05552677/05222667/55622667/66666677","00000001/02033311/00444311/00044444/05555464/55774466/55777776/77777666","00000001/02200011/32200014/32330015/32300015/33306005/76666655/77777555","00000111/00000122/00300122/44344122/44441122/44441152/46446655/66666755","00000111/00111112/00134412/00335412/30334412/33344112/67777712/66677711","00000000/00011112/03344412/05364112/05364711/05364411/05566651/05555551","00000000/00010223/00114443/01114443/01555633/07575533/07577333/07773333","00000001/00011111/22222221/23324441/33324111/35644441/35557411/35777777","00000000/01000232/41005222/44005522/46005555/46000555/46066657/46667777","00000011/00200111/22200131/24200111/24250166/24550111/25570000/55577000","00000011/00200013/22240113/32240033/33333335/33333365/37773555/37777775","00000000/00011020/03001110/03334444/05333336/05557766/07777666/00777776","00000011/02000001/32045551/32046551/22045551/22047511/20077557/22277777","00000001/22200111/33200415/33204444/33600044/73660004/77766644/77766664","00000000/00011223/04451222/04451555/04451566/07555566/07775566/00775556","00000000/00011123/02222223/04442223/04452633/04442636/44477636/44446666","00000000/00010112/30011112/00045612/04446612/04446612/00446617/00666677","00000000/00001120/30111222/30001245/30601255/33607255/33602255/66622222","00000000/11110223/41122223/44422253/66422333/62222777/62222277/66666677","00000001/02324001/02224111/52211112/55222222/56622272/56667772/66666662","00000000/00111002/00031002/00031044/00531044/66531744/66551444/66655554","00000000/01120003/04122003/01120003/01111003/00555553/67755533/66665553","00000000/00100200/03102224/03335526/33335226/37755526/37775526/77755566","00000001/23000001/23300101/33333111/34444444/33354466/36666446/33776666","00000000/11002223/10002223/10000223/10440533/10440666/77440066/70000006","00000001/22033331/22031111/22000111/24000115/24046155/24446155/26666117","00000000/00111100/01122233/01223334/01222335/06723355/07722355/00772255","00000000/00000100/02311100/03334100/03444550/63744555/63755555/33333335","00000000/11100222/10000023/10400025/10444225/10622225/10662555/00777555","00000001/02203331/44303311/55333511/55555516/55577556/77776666/77766666","00000000/01100222/01111232/01145332/00145632/05555622/05766622/06666662","00000010/22002000/20022333/20222345/22252445/22655555/75555555/77777755","00000000/11000223/10004423/10444443/10045563/70044663/77000033/77703333","00000000/00010203/01110223/04511223/04551623/05551123/05557722/05555777","00000000/00011111/02223114/02111144/00000445/05606555/05666557/05555557","00000000/01102223/04555523/04566623/04567622/04777622/04447642/04444442","00000000/00001233/00401223/05411113/05551133/05511133/55516633/57716333","00000000/01102223/01444453/00444453/06665553/06775333/07777333/00073333","00000001/22233011/44200015/44406615/44406115/00006155/07666115/06611111","00000000/00123333/01123443/00123344/00125554/01126655/77116155/11111111","00000001/00222001/03222201/33244401/22254001/25554111/25611167/66666667","00000000/00011222/03044422/03045552/03044522/63022222/63027722/33022222","00000000/00012233/00011243/00001243/55001243/56611243/53333333/55557773","00000111/01111111/02333133/02223333/04222222/54666622/55677772/55666662","00000000/01230045/01130045/61630775/61630755/66630755/33330777/33777777","00000000/11002333/11002333/11002334/11222554/61622266/61666666/66667777","00000000/00111120/30111221/30111111/30415555/30446557/44444557/44444455","00000000/01022223/01124433/00124553/00124443/01122333/31663373/33333777","00000000/00011110/20013410/20513440/20513330/22553333/62573773/67777773","00000000/00012221/03012241/03111141/03331551/06671151/06671111/07777771","00000000/00001110/21111110/21113111/24413555/24513355/66517775/66555555","00000000/00000001/00022011/30425116/30425576/30425776/30027766/30227776","00000001/02003333/02233233/04222253/00662555/00666555/77666655/77776555","00000000/00000112/00033312/03334552/03344422/00666622/07222222/07777222","00000000/10022223/10002223/00422553/04426633/04444443/03774433/03333333","00000000/00011022/00311002/00311144/03314444/03315464/07315566/77715566","00000000/00000110/23334114/22334444/22333334/25536634/77666444/74444444","00000000/00000010/00220011/30222221/00445266/00445577/70044447/77777777","00000001/02222211/00001211/03001111/33000114/35500144/55566774/55667774","00000111/00111111/20122211/22223311/44233115/44231115/46633665/77666665","00000000/01100022/31100042/33101042/31111122/55555122/55666166/55776666","00000000/00011123/04444223/05554443/05544433/05564735/55664735/55555555","00000111/22000111/22111133/22224553/22244533/26645557/66644557/66644457","00000001/00222201/03244501/03243501/33333601/33336611/37111111/37777777","00000000/00001111/00200134/05230334/05233334/06222274/06666774/00444444","00000000/00010002/03110222/43150002/43156066/43666667/43637777/33333337","00000000/00011233/04415222/04555266/04557226/00507026/00000026/22222226","00000000/00110223/00415523/60411122/66444422/66447772/66444722/66644772","00000111/02221131/00022435/00022435/60722335/60722335/60777333/60007777","00000000/01122222/01133222/00443252/00443652/00066652/07055552/55555555","00000000/00112233/00112222/40011112/40115552/40444444/44466644/44667777","00000000/00000112/00222222/03322222/03342222/05555662/07755562/07777766","00000001/02220011/34250061/34250061/37220661/77720611/77220611/77222222","00000000/00001111/20003441/20553341/20033441/20663771/26661111/66666666","00000000/01102230/11102232/11112222/14444552/14464452/17766555/17666665","00000000/00110233/01100222/11000222/14005222/14065557/11065557/11111177","000000011/000000001/000222301/222224001/522644011/222640001/772668000/772688880/772688800","000000112/003031112/003331222/033331425/000041422/607044442/707088444/777088888/700000888","000000000/001122223/041111223/005551223/055552223/000555233/666555223/666665727/666668777","000000112/003300011/004330111/553330161/553530666/555530776/558737776/858777776/888766666","000000111/000001112/000333111/333333114/355311114/365554714/368554414/368854414/388888444","000000000/000000110/203200140/222241140/222444444/222455466/222555576/825577776/555566666","000000000/011111112/333314112/334314222/334444522/367455522/665555522/665558222/665522222","000000001/000220211/000222213/002222111/002422111/044425551/647775588/447775888/444445888","000000111/022200001/333222411/553221111/653221111/553321777/558333777/888377777/888377777","000000001/002200033/002220033/045000333/044060003/044466633/747776888/777666688/666666668","000000000/011022233/010022433/010002235/116662555/111662225/711668555/116688888/116668888","000000000/001100002/031100002/031333342/033355522/066657522/006885522/088855552/088885522","000000000/001111122/033333322/033344352/033345552/033344552/444446755/447777775/477877555","000000111/002200131/002440111/002445161/022445566/022245556/222445766/282885556/888866666","000001122/011111112/000133332/001111333/444113335/444413665/444443365/447646665/866666555","000000001/022230111/002244411/002241115/000441616/707466666/707666688/707688888/777888888","000000000/100022333/400023333/440022533/444442236/447766266/447762286/747668886/777666666","000001111/000222311/000241111/022241114/002444444/222555544/266777555/226677755/666687775","000000000/000122222/011112222/111132442/115633344/155553444/177753384/177773334/177777744","000000000/001111111/002213311/004213351/044263351/042223351/047233851/047735551/777777771","000000000/000111220/000122222/011111321/044441111/054461166/054461676/044861666/088866666","000000001/000222311/000233314/052233114/055233114/055533144/555673114/555777444/587777744","000000000/012103333/011101133/041111133/051116173/055566773/055777773/055888733/888888833","000000000/000012220/031412220/031111220/031551666/031551666/055511766/557578776/557777776","000000010/222020000/222223333/424425333/444455336/777445333/774455558/774455888/777555588","000000000/000001111/022000001/022003331/042205331/044444361/078666361/088666661/088886611","000000000/011100222/311300224/313300254/333300444/336660444/666600074/666770074/686777774","000000010/022230000/222444450/242444655/244466655/222266655/777786665/778788855/778888555","000000000/001123333/011223443/011124453/011114553/016115573/666115873/666655773/666665573","000000000/000012023/040512223/041113333/441133333/644443773/664663733/686667737/666666777","000001122/003000222/033220022/033322222/334325555/334425555/344466656/347466666/777778666","000000000/000000111/002211111/322111144/325444444/322666667/388888666/388886666/333333333","000000000/001022203/001023223/001123333/411333563/413377553/413377553/444777555/844777555","000000001/020031111/022231111/022331145/002334444/022344466/224447466/228866466/888866666","000000000/011120034/011122034/566112034/566212034/576222333/576853333/566555553/555555533","000000000/001111111/203444511/203434411/233333111/222663177/822633777/666663777/677777777","000000000/010002222/010303324/013333144/011353144/011111144/016666114/017778444/011777444","000000011/022222001/322222221/333452211/663444711/663344444/633333338/666333338/633388888","000001111/222000011/222033113/224443333/255543666/555543366/555547336/555544666/555584666","000000000/010022220/333322240/333332440/335333340/555666640/555555666/555777787/555777777","000001111/000011112/300000111/333330111/334335567/334455577/444558777/444888877/444488877","000000001/022322201/042221101/044225111/004455151/044445551/000006657/006600655/806666665","000000011/022000001/324411101/322451111/332466111/332446667/322246666/322666626/382222226","000000000/000111222/000122222/011113244/015114444/055544646/077746666/077846666/006666666","000000111/000001112/002022222/022223444/523333644/222366664/222378666/222388686/222388886","000001111/020000011/022220031/111111011/444441115/445555555/466665577/466665577/466867777","000000111/022220111/032000011/022441111/024451115/444555555/466557777/467777777/466687777","000000012/030400022/334400222/534402222/534222422/554444462/577477666/574477766/577776668","000000111/000002211/330042411/344444441/344441111/344455616/333756616/333356616/855555666","000000001/011000111/021111111/022314411/222334445/222234445/222633445/728888455/888555555","000000001/022200001/022203011/022433311/522222226/722278666/777778666/877788886/888888666","000000000/000110223/040115223/044165233/074555285/074588885/074555585/074555555/077777777","000011122/001001122/011111122/334442225/633345555/733344555/774444454/777774444/777877744","000000011/022034001/552234441/522333641/522233644/555236647/852236644/555333666/533333336","000000001/000231111/000234411/005222411/005211111/005555511/605577558/005577558/055777777","000000000/001022300/011024440/011122244/015126224/062226744/066666776/066666766/088866666","000000000/100222202/100003222/114503322/144403333/114406663/117700666/777770086/777700666","000000000/000012333/450222333/400223333/403333333/403666377/400066777/400467777/444467787","000000000/012220334/052200034/055222224/056224444/056677444/556667774/666687774/666664444","000000000/000111222/033131112/043335562/044355552/045555777/055575577/088575777/007777777","000000000/011020333/111022332/100042222/111445462/171144462/171114462/777811162/777777162","000000011/200033111/224435166/322431167/322431777/333331771/311111111/338888881/333331111","000000012/300040112/333341112/553444442/533444662/544466622/577767662/555777766/557777768","000000001/020033311/000000311/033333311/333433351/674444551/677744458/667777455/666744455","000000000/011222233/042223335/044263555/064663575/066663375/088666777/088888887/088888777","000000000/011111111/012112222/112222344/112244444/122254666/155555556/555577786/555777666","000000000/000110002/003100004/003334004/033444444/055555555/055556665/777566555/778866666","000000001/233004001/230004511/200244511/222244516/244444511/274475555/274477888/777777888","000000000/000100022/001113444/551613664/555633674/665636644/655666644/665666848/666688888","000000111/001111111/011122111/013332111/013332241/566666244/566444444/566474477/586777777","000000122/000000122/000334112/033331155/333631557/833655557/836655557/888666657/888887777","000000000/012222203/011242233/001242223/000044423/055003333/055677773/555555733/555885555","000000000/000123334/500113444/511133464/555166664/555167777/555111177/855555557/888888777","000001111/002011334/202001133/222055533/222553333/226657333/266655333/222665588/666688888","000000000/120003334/111003434/111003444/111053344/111155364/111115334/177755833/888888883","000000001/002033111/042225511/044222111/004411111/004444411/600444447/000444447/444448888","000000000/010102334/011103334/015554344/015554444/015555556/011577766/081577766/006666666","000000001/220300031/222333331/425511111/425511611/445551611/744511666/884416666/888816666","000000001/002100111/002111113/022444133/024444133/522467777/222467668/222466668/222468888","000000001/220001111/200033411/205003331/255555531/265771111/266671111/266671888/266666666","000000000/000012111/033311114/034444444/033344444/000345555/066347855/066347775/666677777","000000111/234111111/334151111/344111661/334177766/344177668/344176688/441176688/441778888","000000001/022200011/032204411/054204111/554444411/555667411/555664444/886644644/888666644","000000011/002233011/044225511/004225511/004111111/004444411/600477448/404447448/444447777","000000000/000000001/203000111/223300000/233455066/273555556/773558866/755558866/777555555","000000011/220330114/120350144/120351164/155555164/111111164/177116668/171166166/171111116","000000000/000123330/011144430/000111333/005533333/005555533/600575558/005575558/055777777","000001111/002331113/022333113/442553333/442555533/422555533/422226533/728826666/228826666","000000011/222000111/232222221/233444421/233333421/222333451/622633455/666673557/666877777","000000001/200033311/004443311/044456333/045456667/055555677/555588666/555886666/555888666","000000000/001111111/002222211/000032111/044552221/444566661/444555661/777557766/787777666","000000000/011102220/111202233/222222333/244222533/246662533/247662553/247662353/777866333","000000000/001122340/001122240/005112440/005511400/555661477/885666777/885886776/888886666","000000000/001111111/200111111/222233331/344435556/344437776/334438666/334438888/333338888","000000111/023300111/333340115/673440055/673444455/677746445/666746455/667766458/666666455","000000000/010222344/010222244/110004444/100000554/111066654/000067655/008066666/008666666","000000111/200011111/200033331/242003551/222033551/262073555/862003355/866600355/888660355","000000000/000102234/011122334/051122334/011133334/066173344/066663344/086888344/088883333","000000001/000021111/003324411/005333311/005551111/005555511/655557558/555577578/555577777","000000001/023000011/023345011/022344416/000334416/700333418/700013118/707711188/777778888","000000000/000112220/001112334/041222334/044444444/056664444/055664444/077664844/076664444","000000000/001102223/001444423/004433333/004444443/054466773/088446673/088488663/888886633","000000000/011111111/012334451/002344451/002367451/022367451/028366451/008336451/333355551","000000001/000111111/023114454/023134554/033334444/333333336/333733666/777766686/777776666","000011122/033001112/333004412/533344412/555366447/533366666/538866666/338868866/388888886","000000001/203333400/233544440/234446640/233666770/222266777/222266677/228222777/888882277","000000001/220031111/200033441/200544441/226545741/226555111/626555888/626665888/666688888","000000011/200033114/250033111/655003171/665033777/655335777/655555757/688585557/668888877","000000000/001010020/011112223/041552253/041155553/111115663/177115633/176616633/776666688","000000000/011122033/021224333/022254443/065554477/065854777/066884777/066887777/077777777","000001111/000000111/023333314/033551314/535551114/555555567/566666667/566888867/568888877","000000000/011200345/012244445/062444555/062247577/066447777/066647777/068847787/066888887","000000001/002333011/022234411/005211111/005211111/005555511/605577518/005577518/055557777","000000000/001111110/001211311/401533331/401553333/600553773/660553877/665555887/555555555","000000012/003333312/003111112/443551222/433511122/443516666/447555866/447775665/477775555","000000001/002034111/022244411/005211411/005111111/005555511/605557588/555777558/555557777","000000012/000000012/030004442/333000542/333330042/333666444/366664474/386766777/888777777","000000000/000111112/000133442/055133344/051166444/011116664/071118884/011188884/001111144","000000000/000111122/000111222/001133222/000443352/000644355/708683335/708883555/008833555","000000000/000000111/202330411/222230001/222233551/623337511/626655511/666888111/666666111","000000000/001101222/034111112/033555122/033655522/076666522/077776662/088766662/088866666","000000000/102034055/166634005/116634000/166631077/113331077/111131077/188111077/188000007","000000111/020020011/022223041/055233441/055253341/005553344/605553334/666667884/666666884","000000000/000111230/011111220/014411222/015441122/015555555/555566655/555766655/777788665","000000001/223033011/223333014/225663014/225600011/255675011/855555001/858880001/888111111","000000000/000110022/030415002/030015662/031115562/033335666/733338866/688888866/666666666","000000000/001223330/000233435/002234465/072234465/077733465/007774465/088774565/555555555","000000000/011122230/014124230/044144330/044444433/555444633/575556663/577758863/555555553","000000000/001111110/001111212/001311222/041355266/041356667/011356667/118356667/166666666","000000000/000001203/040501233/645500233/644770243/647720243/447222243/444422444/448444444","000000001/002334001/022244411/055211111/005211111/005555551/600577558/000577558/555557777","000000011/200000111/200001111/230011111/333114411/331154441/111554677/188544667/885544467","000000012/000001112/033331112/333111222/333144222/353644265/355666665/375555555/333333385","000000001/222000301/222043311/205043311/200043617/280043616/283043666/283333336/288888886","000000001/022233111/022224411/005211411/005111111/005555511/605557518/005557578/005557777","000000001/111111111/111222222/112233324/112253554/166255577/166258777/166258777/166666667","000000001/022231111/022224411/005221411/005221111/005555111/605575578/500577578/555577777","000000010/202030000/202033333/222034434/522033444/522233444/526266664/526676684/666666884","000000000/111010023/111110423/151160223/155560223/177660233/777680333/766680033/666660000","000000001/002223301/022244333/002224443/552522246/555555746/557777776/777878866/777888866","000000001/022000011/023000441/533604441/566604111/566004718/550004778/555077778/555557777","000000001/002033111/002222411/005222411/005111111/005555111/605555557/005555557/555558888","000000000/010020345/010023345/016623445/066623755/088627755/086627755/066777755/066777777","000000001/000220111/003334411/005311411/005111111/005555511/605557518/505557578/555557777","000000001/000021111/003334411/005331411/005111111/005551511/605555517/000558557/555588888","000000000/001023333/044425535/044625555/042622555/042222555/044772885/004777785/444444444","000000000/010002223/010022444/014444454/010005556/000755556/066666656/066686666/088886666","000000000/001233334/001234344/011244445/011266775/011266677/022266667/022222267/888222667","000000000/010001020/011111222/013342222/013442562/033442566/033477565/038875555/055555555","000000000/001111110/011234415/011255455/012265555/077266666/022288886/022888226/222222266","000000000/001111110/201223330/222244330/552246633/552446773/554446773/555466833/554468833","000000000/011020333/014425553/011423553/013333333/013667771/011166611/081116111/011111111","000000000/001220333/001114453/004144453/004444553/066655577/000665557/606666667/666688887","000000000/000111102/011113302/014155602/004455652/004455552/077422222/072228822/022888882","000000001/122223331/124423311/144522311/144522211/145551111/111111611/178876611/177776666","000000000/011000234/011555534/011155534/011333334/016773774/016877744/016674444/016666444","000000112/030001122/430511112/430555512/430556222/430536622/435537777/335333333/333338333","000000000/000010110/222011120/332222222/334522266/344522667/347556657/777755557/888777777","000000001/223222011/422252001/426655501/426655501/226557701/222222201/288228222/228888888","000000000/000001233/040111222/044111122/044455122/046444122/046444172/066884172/066664111","000000000/010000222/311102242/315604442/355607842/333607844/333607644/633666664/666666444","000000000/011023330/011114433/005113333/005333333/005555536/700558556/000558556/055558888","000000000/010020033/011222243/051622443/051662733/055566733/057888733/077787733/077777333","000000000/000110022/000113042/055163444/555163334/556667774/558866774/555555554/555444444","000000001/002234111/022234411/005221111/005111111/005555511/600577558/000575558/005577777","000000111/222022111/200023311/222223331/424445331/444555551/444556776/444586666/444588888","000000000/001023444/011122444/012222444/012255554/012657744/012647774/012444444/000008884","000000000/001122330/011442550/001142550/000145540/060144440/066144470/667177777/667778888","000000000/000101011/220111111/223333314/522223314/555555566/757777576/777777776/788888866","000000001/000021111/033334411/000333111/005111111/005555511/600577558/505577558/555557777","000000001/000223101/022233111/451111167/458888667/488866667/444444767/444744767/477777777","000000000/011112222/011122342/001522344/061552347/061557377/061157777/066155887/666665577","000001111/022221221/023222221/423222525/433522555/443555555/433555556/773538886/733333366","000000000/010222330/111223340/222222240/256277240/656278840/656277740/666274440/444444440","000000000/000111100/200021110/222223333/222243553/622744533/622444538/664433338/666433888","000000000/000112003/011122223/012224423/012244555/012246555/017246555/017266666/007778666","000000001/001111111/203311144/205331146/205534446/205544446/227542844/227442888/222222288","000000000/001023330/011022240/111111140/155555140/115566444/555567744/554888774/444444444","000000001/020034111/222034445/222033335/220033666/222233776/282888766/288878766/277777776"];
  /* </SHAPE_BANK> */

  /* <CAMPAIGN_SOURCE> */
  var CAMPAIGN_SOURCE = [0,1,2,3,4,5,9,13,15,17,20,21,26,28,32,39,6,7,8,10,11,12,14,16,18,19,22,23,25,27,29,30,33,34,36,41,43,44,48,49,50,51,52,53,54,56,24,46,63,38,40,55,67,70,91,96,99,102,105,110,127,129,132,140,151,159,163,173,174,31,35,37,47,57,58,60,61,62,64,65,66,68,69,72,77,83,86,92,95,98,103,108,109,112,113,116,119,122,125,128,130,131,133,134,135,136,137,139,146,150,152,156,157,158,162,164,171,172,176,42,45,59,71,73,74,75,76,78,79,80,81,82,84,85,87,88,89,90,93,94,97,100,101,104,106,107,111,114,115,117,118,120,121,123,124,126,138,144,145,155,169,170,179,181,187,188,191,194,195,199,200,203,205,206,207,211,212,214,215,217,218,219,220,225,226,227,228,233,235,238,239,241,243,244,154,160,161,167,168,178,182,184,149,153,180,183,185,190,192,193,196,197,201,202,208,209,210,213,216,221,222,223,224,229,230,231,232,234,236,237,240,242,246,247,248,249,250,143,166,177,186,189,204,245,198,141,142,147,148,165,175,256,259,262,266,309,253,267,272,341,345,346,347,387,251,254,255,265,268,271,275,297,301,257,260,263,264,269,270,273,277,279,283,290,291,295,296,298,299,303,308,313,315,317,320,321,322,323,325,326,328,331,333,334,336,339,340,342,343,350,352,354,356,359,360,366,369,370,372,376,385,252,258,261,274,276,278,280,281,282,284,285,286,287,288,289,292,293,294,300,302,304,305,306,307,310,311,312,314,316,318,319,324,327,329,330,332,335,337,338,344,348,349,355,377,379,388,425,409,418,435,392,394,400,353,361,364,375,380,389,390,393,395,398,401,405,407,411,412,419,420,423,428,430,431,433,437,439,440,441,448,351,381,382,396,399,406,358,363,383,386,397,373,378,408,413,414,421,422,424,427,432,442,444,447,450,402,403,417,443,445,434,404,429,449,426,367,357,384,374,362,368,371,416,436,438,365,391,446,410,415,482,458,505,459,461,468,472,473,477,481,484,486,499,509,514,519,520,453,455,480,506,526,545,460,462,465,466,469,471,474,475,476,478,479,485,489,490,496,497,503,504,507,508,512,451,454,456,457,463,467,470,483,488,491,492,493,494,498,500,513,516,518,521,522,523,529,536,543,553,558,568,575,579,588,452,464,487,495,501,502,510,511,517,530,554,577,515,548,583,537,540,533,550,552,557,562,567,582,609,614,535,549,561,625,639,532,565,570,581,593,555,525,539,542,544,546,547,560,578,585,602,605,611,620,628,629,524,531,534,541,551,564,572,573,576,589,590,597,598,600,559,527,571,584,608,613,621,637,640,596,591,594,616,528,599,604,612,615,619,606,607,623,638,649,603,624,636,646,556,618,644,592,563,538,566,586,601,569,617,574,580,630,631,648,595,650,626,633,610,634,641,645,587,635,632,642,643,627,622,647,664,672,675,691,698,700,701,651,654,657,659,660,667,669,674,678,681,682,684,685,690,694,695,699,658,661,663,676,733,653,662,666,670,683,692,696,703,707,652,656,665,668,671,677,679,686,687,689,697,704,718,722,724,725,726,736,743,755,693,708,711,716,728,702,688,762,680,786,720,709,710,715,738,739,740,761,714,734,737,742,748,759,766,816,729,735,741,744,745,752,770,750,769,776,782,796,806,717,730,753,764,779,781,815,727,754,756,763,767,712,773,780,795,798,719,731,765,778,783,790,673,792,655,723,774,775,785,747,791,797,705,757,784,787,799,772,732,749,751,758,760,768,771,789,706,713,777,818,721,793,811,794,809,810,817,802,746,812,814,788,813,803,808,801,800,804,807,819,820,805,876,990,842,850,852,856,869,907,940,823,829,834,836,840,846,853,854,857,858,864,870,881,889,924,831,833,839,843,848,849,855,872,931,845,866,851,892,873,844,825,830,832,877,863,837,886,828,919,824,826,835,847,867,874,897,911,860,882,883,880,913,944,951,822,838,918,966,890,861,906,922,989,996,821,884,893,894,912,994,859,887,896,963,974,980,993,841,921,970,949,953,975,926,827,891,909,915,871,862,977,878,902,925,920,929,875,899,900,938,947,954,985,868,879,917,936,943,865,972,895,901,910,942,979,946,957,958,967,976,982,973,898,908,962,981,888,916,933,955,964,941,965,903,923,939,948,956,987,998,885,914,945,950,992,937,959,927,932,968,983,988,997,999,995,971,978,984,904,928,935,991,930,952,961,986,960,969,934,905];
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
    var spec = levelSpec(level);
    var target = targetDifficulty(spec);
    var slack = 5 + (1 - spec.progress) * 8;
    var used = usedShapesForSize(spec.n, level);
    var best = null;
    var bestDist = Infinity;
    var attempt;
    var candidate;
    var accepted;
    var dist;
    var firstTries = spec.n >= 8 ? 40 : spec.n >= 7 ? 32 : 22;
    var lateTries = spec.n >= 8 ? 24 : 10;
    var extraTries = spec.n >= 7 ? 48 : 16;

    for (attempt = 0; attempt < firstTries; attempt++) {
      candidate = rateAndStamp(buildLevelPuzzle(level, attempt), level);
      accepted = acceptCandidate(candidate, spec, used, {
        requireTarget: true,
        relaxLimits: false,
        target: target,
        slack: slack,
      });
      if (!accepted) continue;
      dist = Math.abs(accepted.difficulty - target);
      if (accepted.difficulty < target) dist += (target - accepted.difficulty) * 0.35;
      if (dist < bestDist) {
        best = accepted;
        bestDist = dist;
        if (dist < 2.5) break;
      }
    }

    if (!best) {
      var preferHard = spec.progress > 0.55;
      for (attempt = 0; attempt < lateTries; attempt++) {
        candidate = rateAndStamp(buildLevelPuzzle(level, attempt), level);
        accepted = acceptCandidate(candidate, spec, used, {
          requireTarget: false,
          relaxLimits: false,
        });
        if (!accepted) continue;
        if (
          !best ||
          (preferHard && accepted.difficulty > best.difficulty) ||
          (!preferHard && accepted.difficulty < best.difficulty)
        ) {
          best = accepted;
        }
      }
    }

    if (!best) {
      for (attempt = firstTries; attempt < firstTries + extraTries; attempt++) {
        candidate = rateAndStamp(buildLevelPuzzle(level, attempt), level);
        accepted = acceptCandidate(candidate, spec, used, {
          requireTarget: false,
          relaxLimits: true,
        });
        if (!accepted) continue;
        dist = Math.abs(accepted.difficulty - target);
        if (accepted.difficulty < target) dist += (target - accepted.difficulty) * 0.35;
        if (!best || dist < bestDist) {
          best = accepted;
          bestDist = dist;
          if (dist < 3) break;
        }
      }
    }

    if (!best) {
      var fallbackList = FALLBACKS[spec.n] || FALLBACKS[5];
      var fi;
      var mutated;
      for (fi = 0; fi < fallbackList.length; fi++) {
        mutated = nibblePuzzle(
          {
            n: spec.n,
            level: level,
            regions: cloneRegions(fallbackList[fi].regions),
            stars: fallbackList[fi].stars.slice(),
            palette: Array.from({ length: spec.n }, function (_, i) {
              return i;
            }),
          },
          level,
          12 + (level % 9),
          200 + fi
        );
        candidate = rateAndStamp(mutated, level);
        accepted = acceptCandidate(candidate, spec, used, {
          requireTarget: false,
          relaxLimits: true,
        });
        if (accepted) {
          best = accepted;
          break;
        }
      }
    }

    if (!best) {
      for (attempt = 180; attempt < 260; attempt++) {
        candidate = rateAndStamp(buildLevelPuzzle(level, attempt), level);
        if (!candidate) continue;
        if (used[canonicalShapeKey(candidate.regions)]) continue;
        if (fallbackShapeSet()[canonicalShapeKey(candidate.regions)]) continue;
        best = candidate;
        break;
      }
    }

    if (!best) {
      fallbackList = FALLBACKS[spec.n] || FALLBACKS[5];
      var salt;
      var pick;
      for (salt = 1; salt <= 80 && !best; salt++) {
        pick = fallbackList[salt % fallbackList.length];
        mutated = nibblePuzzle(
          {
            n: spec.n,
            level: level,
            regions: cloneRegions(pick.regions),
            stars: pick.stars.slice(),
            palette: Array.from({ length: spec.n }, function (_, i) {
              return i;
            }),
          },
          level,
          8 + (salt % 11),
          400 + salt
        );
        candidate = rateAndStamp(mutated, level);
        accepted = acceptCandidate(candidate, spec, used, {
          requireTarget: false,
          relaxLimits: true,
        });
        if (accepted) best = accepted;
      }
    }

    if (best && used[canonicalShapeKey(best.regions)]) best = null;

    if (!best) {
      for (attempt = 260; attempt < 520 && !best; attempt++) {
        candidate = rateAndStamp(buildLevelPuzzle(level, attempt), level);
        accepted = acceptCandidate(candidate, spec, used, {
          requireTarget: false,
          relaxLimits: true,
        });
        if (accepted) best = accepted;
      }
    }

    if (!best) {
      throw new Error("無法為第 " + level + " 關產生獨一盤面");
    }

    levelCache[level] = best;
    return best;
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
    targetDifficulty: targetDifficulty,
    countSingletons: countSingletons,
    canonicalShapeKey: canonicalShapeKey,
    compactShapeKey: compactShapeKey,
    SHAPE_BANK_COMPACT: SHAPE_BANK_COMPACT,
    DIFFICULTY_MAX: DIFFICULTY_MAX,
    DIFFICULTY_WEIGHTS: DIFFICULTY_WEIGHTS,
  };
});
