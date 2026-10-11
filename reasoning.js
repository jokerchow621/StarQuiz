(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StarReasoning = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Depth is relative to these explicit rules, not to a particular player's
  // strategy. At depth zero: row/column/region singles and pairwise support
  // (same column, same region, adjacent stars) are propagated to a fixed point.
  // At depth k, a candidate is removed only if assuming it produces a
  // contradiction after closing all deductions available at depth k - 1.
  // Repeating depth-one deductions is still depth one, however long the chain.
  var MODEL = "star-group-support-failed-literal-v1";

  function copy(domains) {
    return domains.map(function (row) { return row.slice(); });
  }

  function supportGraph(regions) {
    var n = regions.length;
    var groups = Array.from({ length: n * 3 }, function () { return []; });
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var cell = r * n + c;
        groups[r].push(cell);
        groups[n + c].push(cell);
        groups[n * 2 + regions[r][c]].push(cell);
      }
    }
    var support = Array.from({ length: n * n }, function (_, cell) {
      var r = Math.floor(cell / n), c = cell % n;
      return groups.map(function (group) {
        return group.filter(function (other) {
          if (cell === other) return true;
          var s = Math.floor(other / n), k = other % n;
          return r !== s && c !== k && regions[r][c] !== regions[s][k] &&
            (Math.abs(r - s) > 1 || Math.abs(c - k) > 1);
        });
      });
    });
    return { groups: groups, support: support };
  }

  function propagate(domains, graph) {
    var n = domains.length;
    var active = Array(n * n).fill(false);
    domains.forEach(function (row, r) {
      row.forEach(function (c) { active[r * n + c] = true; });
    });
    var changed = true;
    while (changed) {
      changed = false;
      for (var cell = 0; cell < active.length; cell++) {
        if (!active[cell]) continue;
        // A proposed star must leave a compatible location in EVERY row,
        // column and region. Treating all three symmetrically also handles
        // pointing and common-neighbour exclusions, regardless of rotation.
        for (var g = 0; g < graph.groups.length; g++) {
          if (!graph.support[cell][g].some(function (other) { return active[other]; })) {
            active[cell] = false;
            changed = true;
            break;
          }
        }
      }
      if (graph.groups.some(function (group) {
        return !group.some(function (cell) { return active[cell]; });
      })) return null;
    }
    return domains.map(function (row, r) {
      return row.filter(function (c) { return active[r * n + c]; });
    });
  }

  function closed(regions, domains, depth, context) {
    context.nodes++;
    if (context.nodes > context.maxNodes) throw context.limit;
    var current = propagate(copy(domains), context.graph);
    if (!current || !depth || current.every(function (row) { return row.length === 1; })) {
      return current;
    }
    var key = depth + ":" + current.map(function (row) { return row.join(","); }).join("/");
    if (context.memo.has(key)) return context.memo.get(key);
    while (true) {
      var removals = [];
      for (var r = 0; r < current.length; r++) {
        if (current[r].length === 1) continue;
        for (var i = 0; i < current[r].length; i++) {
          var c = current[r][i];
          var assumed = copy(current);
          assumed[r] = [c];
          if (!closed(regions, assumed, depth - 1, context)) removals.push([r, c]);
        }
      }
      if (!removals.length) break;
      // Batch deductions: scan order must not decide which depth succeeds.
      removals.forEach(function (cell) {
        current[cell[0]] = current[cell[0]].filter(function (c) { return c !== cell[1]; });
      });
      if (current.some(function (row) { return !row.length; })) {
        context.memo.set(key, null);
        return null;
      }
      current = propagate(current, context.graph);
      if (!current || current.every(function (row) { return row.length === 1; })) break;
    }
    context.memo.set(key, current);
    return current;
  }

  function analyze(regions, options) {
    options = options || {};
    var n = regions.length;
    var maxDepth = options.maxDepth === undefined ? 5 : options.maxDepth;
    var context = {
      graph: supportGraph(regions),
      nodes: 0,
      maxNodes: options.maxNodes === undefined ? 250000 : options.maxNodes,
      memo: new Map(),
      limit: {},
    };
    var domains = Array.from({ length: n }, function () {
      return Array.from({ length: n }, function (_, c) { return c; });
    });
    var layers = [];
    var result = { model: MODEL, complete: false, assumptionDepth: null, layers: layers };
    try {
      for (var depth = 0; depth <= maxDepth; depth++) {
        var before = context.nodes;
        domains = closed(regions, domains, depth, context);
        if (!domains) {
          result.contradiction = true;
          result.complete = true;
          break;
        }
        var remaining = domains.filter(function (row) { return row.length > 1; }).length;
        layers.push({
          depth: depth,
          remaining: remaining,
          candidates: domains.reduce(function (sum, row) { return sum + row.length; }, 0),
          probes: context.nodes - before - 1,
        });
        if (!remaining) {
          result.complete = true;
          result.assumptionDepth = depth;
          result.solution = domains.map(function (row) { return row[0]; });
          break;
        }
      }
    } catch (error) {
      if (error !== context.limit) throw error;
      result.limitReached = true;
    }
    result.lowerBound = result.assumptionDepth === null ? layers.length : result.assumptionDepth;
    result.nodes = context.nodes;
    return result;
  }

  return { MODEL: MODEL, analyze: analyze };
});
