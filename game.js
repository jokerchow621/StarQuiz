(function () {
  "use strict";

  var COLORS = [
    "#e86b8a",
    "#3d9be0",
    "#e8b84a",
    "#4faf5c",
    "#8b5fbf",
    "#e07a2f",
    "#1f9b8e",
    "#c44b3c",
    "#4f5f8a",
  ];

  var SAVE_KEY = "mieoduku-campaign-v1";
  var EMPTY = 0;
  var STAR = 1;
  var CROSS = 2;
  var HINT_STAR = 3;
  var HINT_CROSS = 4;
  var PAGE_SIZE = 50;
  var MAX_REASON_DEPTH = 5;

  var els = {
    lobby: document.getElementById("lobby"),
    play: document.getElementById("play"),
    board: document.getElementById("board"),
    loading: document.getElementById("board-loading"),
    lives: null,
    timer: document.getElementById("play-timer"),
    difficultyLabel: document.getElementById("play-difficulty"),
    scoreLabel: document.getElementById("play-score"),
    scoreFill: document.getElementById("play-score-fill"),
    scoreWrap: document.getElementById("play-score-wrap"),
    hint: document.getElementById("control-hint"),
    reasonToggle: document.getElementById("reason-toggle"),
    clearReason: document.getElementById("clear-reason"),
    reasonLayers: document.getElementById("reason-layers"),
    reasonBack: document.getElementById("reason-back"),
    reasonNext: document.getElementById("reason-next"),
    layerPips: document.getElementById("layer-pips"),
    boardStage: document.querySelector(".board-stage"),
    rulesOverlay: document.getElementById("rules-overlay"),
    resultOverlay: document.getElementById("result-overlay"),
    resultKicker: document.getElementById("result-kicker"),
    resultTitle: document.getElementById("result-title"),
    resultCopy: document.getElementById("result-copy"),
    resultDialog: document.querySelector(".result-dialog"),
    resultNext: document.getElementById("result-next"),
    progressCount: document.getElementById("progress-count"),
    progressFill: document.getElementById("progress-fill"),
    continueBtn: document.getElementById("continue-btn"),
    continueHint: document.getElementById("continue-hint"),
    levelsOverlay: document.getElementById("levels-overlay"),
    chapterTabs: document.getElementById("chapter-tabs"),
    levelGrid: document.getElementById("level-grid"),
    levelPage: document.getElementById("level-page"),
    design: document.getElementById("design"),
    designBoard: document.getElementById("design-board"),
    designPalette: document.getElementById("design-palette"),
    designReasons: document.getElementById("design-reasons"),
    designReasonTitle: document.getElementById("design-reason-title"),
    designReasonList: document.getElementById("design-reason-list"),
    designHint: document.getElementById("design-hint"),
    designSubmit: document.getElementById("design-submit"),
    designRegen: document.getElementById("design-regen"),
    designRestart: document.getElementById("design-restart"),
    designScore: document.getElementById("design-score"),
    designScoreAnchor: document.getElementById("design-score-anchor"),
    designApply: document.getElementById("design-apply-hint"),
  };

  var state = {
    level: 1,
    puzzle: null,
    marks: [],
    layers: [],
    order: [],
    orderSeq: 0,
    lives: 1,
    status: "idle",
    mode: "star",
    reasonMode: false,
    reasonDepth: 1,
    startedAt: 0,
    elapsed: 0,
    baseElapsed: 0,
    timerId: null,
    coarsePointer: false,
    lastTouchTap: null,
    ignoreClickUntil: 0,
    crossPaint: null,
    save: null,
    catalogChapter: 0,
    catalogPage: 0,
    showcaseTimer: null,
    scoreAnimId: null,
  };

  var DESIGN_BLANK_STARS = [0, 2, 4, 6, 8, 1, 3, 5, 7];
  var design = {
    stars: null,
    colors: null,
    brush: 0,
    painting: false,
    locked: false,
    judging: false,
    scoreTimer: null,
    scoreDocked: false,
    alt: null,
    hintCells: [],
    hintColor: -1,
  };

  function puzzleLib() {
    if (typeof Puzzle !== "undefined") return Puzzle;
    return window.Puzzle;
  }

  function totalLevels() {
    var lib = puzzleLib();
    return lib && lib.TOTAL_LEVELS ? lib.TOTAL_LEVELS : 999;
  }

  function defaultSave() {
    return { v: 1, lastLevel: 1, clearedUpTo: 0, draft: null, testCleared: [] };
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      var data = JSON.parse(raw);
      if (!data || data.v !== 1) return defaultSave();
      var storedLevel = data.lastLevel | 0;
      data.lastLevel = storedLevel >= 1 && storedLevel <= totalLevels() ? storedLevel : 1;
      data.clearedUpTo = Math.max(0, Math.min(totalLevels(), data.clearedUpTo | 0));
      var lib = puzzleLib();
      data.testCleared = Array.isArray(data.testCleared)
        ? data.testCleared
            .map(function (n) {
              return n | 0;
            })
            .filter(function (n) {
              return lib && lib.isTestLevel(n);
            })
        : [];
      return data;
    } catch (err) {
      return defaultSave();
    }
  }

  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
    } catch (err) {
      console.error(err);
    }
  }

  function unlockedLevel() {
    return Math.min(totalLevels(), (state.save.clearedUpTo || 0) + 1);
  }

  function isCleared(level) {
    return level <= (state.save.clearedUpTo || 0);
  }

  function isTestCleared(level) {
    return (state.save.testCleared || []).indexOf(level) >= 0;
  }

  function isUnlocked(level) {
    var lib = puzzleLib();
    if (lib && lib.isTestLevel(level)) return true;
    return level <= unlockedLevel();
  }

  function resumeLevel() {
    var draftLevel = state.save.draft && state.save.draft.level;
    var resume = draftLevel && !puzzleLib().isTestLevel(draftLevel) ? draftLevel : state.save.lastLevel;
    if (!isUnlocked(resume) || puzzleLib().isTestLevel(resume)) resume = unlockedLevel();
    return resume;
  }

  function showScreen(name) {
    els.lobby.dataset.visible = name === "lobby" ? "true" : "false";
    els.play.dataset.visible = name === "play" ? "true" : "false";
    if (els.design) els.design.dataset.visible = name === "design" ? "true" : "false";
  }

  function formatTime(ms) {
    var total = Math.floor(ms / 1000);
    var m = String(Math.floor(total / 60)).padStart(2, "0");
    var s = String(total % 60).padStart(2, "0");
    return m + ":" + s;
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function currentElapsed() {
    if (state.status !== "playing") return state.elapsed;
    return state.baseElapsed + (Date.now() - state.startedAt);
  }

  function startTimer(base) {
    stopTimer();
    state.baseElapsed = base || 0;
    state.startedAt = Date.now();
    state.elapsed = state.baseElapsed;
    els.timer.textContent = formatTime(state.elapsed);
    state.timerId = setInterval(function () {
      if (state.status !== "playing") return;
      state.elapsed = currentElapsed();
      els.timer.textContent = formatTime(state.elapsed);
    }, 250);
  }

  var draftTimer = null;

  function persistDraft(immediate) {
    if (!state.save || state.status !== "playing" || !state.puzzle) return;
    if (!puzzleLib().isTestLevel(state.level)) state.save.lastLevel = state.level;
    state.save.draft = {
      level: state.level,
      boardKey: puzzleLib().puzzleKey(state.puzzle),
      marks: state.marks.map(function (row) {
        return row.slice();
      }),
      layers: state.layers.map(function (row) {
        return row.slice();
      }),
      order: state.order.map(function (row) {
        return row.slice();
      }),
      lives: 1,
      elapsed: currentElapsed(),
      reasonMode: !!state.reasonMode,
      reasonDepth: state.reasonDepth,
    };
    if (immediate) {
      if (draftTimer) {
        clearTimeout(draftTimer);
        draftTimer = null;
      }
      writeSave();
      return;
    }
    if (draftTimer) return;
    draftTimer = setTimeout(function () {
      draftTimer = null;
      writeSave();
    }, 280);
  }

  function renderLobby() {
    var cleared = state.save.clearedUpTo || 0;
    var total = totalLevels();
    var next = unlockedLevel();
    var resume = resumeLevel();
    els.progressCount.textContent = cleared + " / " + total;
    els.progressFill.style.width = (cleared / total) * 100 + "%";
    els.continueBtn.textContent = cleared >= total ? "重溫第 " + resume + " 關" : "繼續第 " + resume + " 關";
    els.continueHint.textContent =
      cleared >= total
        ? "九百九十九關都過了。隨時可以回看。"
        : cleared
          ? "下一道未過關是第 " + next + " 關。"
          : "從第 1 關開始，格數會由少到多。";
    els.continueBtn.onclick = function () {
      startLevel(resume);
    };
  }

  function catalogChapters() {
    var lib = puzzleLib();
    var chapters = lib.CHAPTERS.slice();
    if (lib.testLevelCount && lib.testLevelCount()) chapters.push(lib.testChapter());
    return chapters;
  }

  function renderCatalog() {
    var lib = puzzleLib();
    var chapters = catalogChapters();
    var chapter = chapters[state.catalogChapter] || chapters[0];
    els.chapterTabs.innerHTML = "";
    chapters.forEach(function (ch, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chapter-tab" + (idx === state.catalogChapter ? " is-active" : "");
      btn.textContent = ch.test ? ch.label : ch.label + " " + ch.n + "×" + ch.n;
      btn.addEventListener("click", function () {
        state.catalogChapter = idx;
        state.catalogPage = 0;
        renderCatalog();
      });
      els.chapterTabs.appendChild(btn);
    });

    var count = chapter.to - chapter.from + 1;
    var pages = Math.ceil(count / PAGE_SIZE);
    if (state.catalogPage > pages - 1) state.catalogPage = pages - 1;
    var start = chapter.from + state.catalogPage * PAGE_SIZE;
    var end = Math.min(chapter.to, start + PAGE_SIZE - 1);
    var labelOf = function (n) {
      return chapter.test ? n - lib.TEST_LEVEL_BASE : n;
    };
    els.levelGrid.innerHTML = "";
    for (var lv = start; lv <= end; lv++) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "level-cell";
      if (chapter.test ? isTestCleared(lv) : isCleared(lv)) cell.classList.add("is-cleared");
      if (!chapter.test && lv === state.save.lastLevel) cell.classList.add("is-current");
      if (!isUnlocked(lv)) {
        cell.classList.add("is-locked");
        cell.disabled = true;
      }
      cell.textContent = String(labelOf(lv));
      cell.addEventListener("click", function (level) {
        return function () {
          els.levelsOverlay.hidden = true;
          startLevel(level);
        };
      }(lv));
      els.levelGrid.appendChild(cell);
    }
    els.levelPage.textContent =
      labelOf(start) + "–" + labelOf(end) + " / " + labelOf(chapter.from) + "–" + labelOf(chapter.to);
    document.getElementById("level-prev").disabled = state.catalogPage <= 0;
    document.getElementById("level-next").disabled = state.catalogPage >= pages - 1;
  }

  function renderLives() {}

  function starSvg() {
    return '<svg class="mark mark-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.55 6.08 6.6.58-5.03 4.28 1.55 6.44L12 17.7 6.33 20.58 7.88 14.14 2.85 9.86l6.6-.58z"/></svg>';
  }

  function altStarSvg() {
    return '<svg class="mark mark-alt" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.55 6.08 6.6.58-5.03 4.28 1.55 6.44L12 17.7 6.33 20.58 7.88 14.14 2.85 9.86l6.6-.58z"/></svg>';
  }

  function crossSvg() {
    return '<svg class="mark mark-cross" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none"/></svg>';
  }

  function goldStarHtml() {
    var path =
      '<path d="M12 3.2l2.55 6.08 6.6.58-5.03 4.28 1.55 6.44L12 17.7 6.33 20.58 7.88 14.14 2.85 9.86l6.6-.58z"/>';
    return (
      '<span class="gold-flip" aria-hidden="true">' +
      '<svg class="mark gold-star gold-star-back" viewBox="0 0 24 24">' +
      path +
      "</svg>" +
      '<svg class="mark gold-star gold-star-front" viewBox="0 0 24 24">' +
      path +
      "</svg>" +
      "</span>"
    );
  }

  function hintBadge(layer) {
    return '<span class="hint-q layer-' + layer + '">' + layer + "</span>";
  }

  function markHtml(mark, layer) {
    if (mark === STAR) return starSvg();
    if (mark === CROSS) return crossSvg();
    if (mark === HINT_STAR) return starSvg() + hintBadge(layer || 1);
    if (mark === HINT_CROSS) return crossSvg() + hintBadge(layer || 1);
    return "";
  }

  function layerOf(r, c) {
    return (state.layers[r] && state.layers[r][c]) || 0;
  }

  function isLockedHint(r, c) {
    return isHintMark(state.marks[r][c]) && layerOf(r, c) !== state.reasonDepth;
  }

  function layerHasMarks(layer) {
    var n = state.marks.length;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (isHintMark(state.marks[r][c]) && layerOf(r, c) === layer) return true;
      }
    }
    return false;
  }

  function layerOriginKeys() {
    var best = {};
    var n = state.marks.length;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!isHintMark(state.marks[r][c])) continue;
        var layer = layerOf(r, c);
        var seq = state.order[r][c];
        if (!best[layer] || seq < best[layer].seq) best[layer] = { seq: seq, key: r + "," + c };
      }
    }
    var keys = {};
    Object.keys(best).forEach(function (layer) {
      keys[best[layer].key] = true;
    });
    return keys;
  }

  function syncOriginMarks() {
    if (!els.board) return;
    var keys = layerOriginKeys();
    var cells = els.board.querySelectorAll(".cell");
    for (var i = 0; i < cells.length; i++) {
      var key = cells[i].dataset.r + "," + cells[i].dataset.c;
      cells[i].classList.toggle("is-layer-origin", !!keys[key]);
    }
  }

  function renderLayerPips() {
    if (!els.layerPips) return;
    els.layerPips.innerHTML = "";
    for (var i = 1; i <= MAX_REASON_DEPTH; i++) {
      var pip = document.createElement("li");
      pip.className = "layer-pip layer-" + i;
      if (i < state.reasonDepth) pip.classList.add("is-past");
      if (i === state.reasonDepth) pip.classList.add("is-current");
      pip.textContent = String(i);
      els.layerPips.appendChild(pip);
    }
  }

  function syncReasonUi() {
    if (els.reasonToggle) els.reasonToggle.checked = !!state.reasonMode;
    if (els.boardStage) els.boardStage.classList.toggle("is-reason", !!state.reasonMode);
    if (els.clearReason) els.clearReason.disabled = !state.reasonMode;
    if (els.reasonLayers) els.reasonLayers.hidden = !state.reasonMode;
    if (els.reasonBack) els.reasonBack.disabled = !state.reasonMode || state.reasonDepth <= 1;
    if (els.reasonNext) {
      els.reasonNext.disabled =
        !state.reasonMode ||
        state.reasonDepth >= MAX_REASON_DEPTH ||
        !layerHasMarks(state.reasonDepth);
    }
    renderLayerPips();
    refreshHintText();
  }

  function clearHintCells(shouldClear) {
    var n = state.marks.length;
    var changed = false;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!isHintMark(state.marks[r][c])) continue;
        if (!shouldClear(layerOf(r, c))) continue;
        state.marks[r][c] = EMPTY;
        state.layers[r][c] = 0;
        state.order[r][c] = 0;
        updateCell(r, c);
        changed = true;
      }
    }
    if (changed) syncOriginMarks();
    return changed;
  }

  function clearReasonMarks() {
    if (state.status !== "playing" || !state.reasonMode || !state.marks.length) return;
    clearHintCells(function () {
      return true;
    });
    state.reasonDepth = 1;
    syncReasonUi();
    persistDraft();
  }

  function nextReasonLayer() {
    if (state.status !== "playing" || !state.reasonMode) return;
    if (state.reasonDepth >= MAX_REASON_DEPTH || !layerHasMarks(state.reasonDepth)) return;
    state.reasonDepth += 1;
    refreshLockedCells();
    syncReasonUi();
    persistDraft();
  }

  function backtrackReasonLayer() {
    if (state.status !== "playing" || !state.reasonMode || state.reasonDepth <= 1) return;
    var depth = state.reasonDepth;
    clearHintCells(function (layer) {
      return layer >= depth;
    });
    state.reasonDepth = depth - 1;
    refreshLockedCells();
    syncReasonUi();
    persistDraft();
  }

  function refreshLockedCells() {
    var n = state.marks.length;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (isHintMark(state.marks[r][c])) updateCell(r, c);
      }
    }
  }

  function refreshHintText() {
    if (state.reasonMode) {
      var prefix = "推理第 " + state.reasonDepth + " 層：";
      els.hint.textContent = state.coarsePointer
        ? prefix + "單擊問號叉叉可滑動 · 雙擊問號星星"
        : prefix + "左鍵問號星星 · 右鍵問號叉叉";
      return;
    }
    els.hint.textContent = state.coarsePointer
      ? "單擊打叉可滑動 · 雙擊放星星"
      : "左鍵放星星 · 右鍵拖曳連續打叉";
  }

  function cellBorders(regions, r, c) {
    var n = regions.length;
    var id = regions[r][c];
    var cls = [];
    if (r === 0 || regions[r - 1][c] !== id) cls.push("edge-t");
    if (r === n - 1) cls.push("edge-b");
    if (c === 0 || regions[r][c - 1] !== id) cls.push("edge-l");
    if (c === n - 1) cls.push("edge-r");
    return cls.join(" ");
  }

  function cellColor(regionId) {
    var palette = state.puzzle.palette;
    var idx = palette ? palette[regionId] : regionId;
    return COLORS[idx % COLORS.length];
  }

  function isStarCell(r, c) {
    return state.puzzle.stars[r] === c;
  }

  function placedStarCount() {
    var marks = state.marks;
    var n = marks.length;
    var count = 0;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (marks[r][c] === STAR) count++;
      }
    }
    return count;
  }

  function renderBoard() {
    var puzzle = state.puzzle;
    if (!puzzle) return;
    var n = puzzle.n;
    var regions = puzzle.regions;
    els.board.style.gridTemplateColumns = "repeat(" + n + ", minmax(0, 1fr))";
    els.board.innerHTML = "";

    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var btn = document.createElement("div");
        btn.className = "cell " + cellBorders(regions, r, c);
        btn.style.background = cellColor(regions[r][c]);
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("aria-label", r + 1 + " 列 " + (c + 1) + " 行");

        paintCellContent(btn, state.marks[r][c], r, c);

        btn.addEventListener("click", onCellClick);
        btn.addEventListener("contextmenu", onCellContext);
        btn.addEventListener("pointerdown", onCellPointerDown, { passive: false });
        els.board.appendChild(btn);
      }
    }
    syncOriginMarks();
  }

  function flashWrong(r, c) {
    var btn = els.board.querySelector('[data-r="' + r + '"][data-c="' + c + '"]');
    if (!btn) return;
    btn.classList.remove("is-wrong");
    void btn.offsetWidth;
    btn.classList.add("is-wrong");
  }

  function failAndRestart(r, c) {
    if (state.status !== "playing") return;
    state.status = "lost";
    flashWrong(r, c);
    state.save.draft = null;
    if (!puzzleLib().isTestLevel(state.level)) state.save.lastLevel = state.level;
    writeSave();
    setTimeout(function () {
      startLevel(state.level, true);
    }, 420);
  }

  function paintCellContent(btn, mark, r, c, drop) {
    var hint = isHintMark(mark);
    btn.classList.toggle("is-hint", hint);
    btn.classList.toggle("is-hint-past", hint && state.reasonMode && layerOf(r, c) < state.reasonDepth);
    btn.classList.remove("is-dropping");
    btn.innerHTML = markHtml(mark, layerOf(r, c));
    if (state.status === "lost" && isStarCell(r, c) && mark !== STAR) {
      btn.classList.add("is-revealed");
      btn.innerHTML = starSvg();
      return;
    }
    if (!drop) return;
    if (mark !== STAR && mark !== CROSS && mark !== HINT_STAR && mark !== HINT_CROSS) return;
    var markEl = btn.querySelector(".mark");
    if (!markEl) return;
    btn.classList.add("is-dropping");
    markEl.classList.add("is-drop");
    markEl.addEventListener(
      "animationend",
      function () {
        markEl.classList.remove("is-drop");
        btn.classList.remove("is-dropping");
      },
      { once: true }
    );
  }

  function updateCell(r, c, drop) {
    var btn = els.board.querySelector('[data-r="' + r + '"][data-c="' + c + '"]');
    if (!btn) return;
    paintCellContent(btn, state.marks[r][c], r, c, drop);
  }

  function tryPlaceStar(r, c) {
    if (state.status !== "playing") return;
    if (state.marks[r][c] === STAR) return;
    if (state.marks[r][c] === CROSS || state.marks[r][c] === HINT_CROSS) return;
    if (isStarCell(r, c)) {
      state.marks[r][c] = STAR;
      state.layers[r][c] = 0;
      updateCell(r, c, true);
      persistDraft();
      if (placedStarCount() === state.puzzle.n) endGame(true);
      return;
    }
    failAndRestart(r, c);
  }

  function isHintMark(value) {
    return value === HINT_STAR || value === HINT_CROSS;
  }

  function setMark(r, c, value) {
    if (state.status !== "playing") return;
    if (state.marks[r][c] === STAR) return;
    if (state.marks[r][c] === CROSS && isHintMark(value)) return;
    if (state.marks[r][c] === value) return;
    var hadMarks = state.reasonMode && layerHasMarks(state.reasonDepth);
    var wasHint = isHintMark(state.marks[r][c]);
    state.marks[r][c] = value;
    state.layers[r][c] = isHintMark(value) ? state.reasonDepth : 0;
    if (!isHintMark(value)) state.order[r][c] = 0;
    else if (!wasHint) state.order[r][c] = ++state.orderSeq;
    updateCell(r, c, value === STAR || value === CROSS || value === HINT_STAR || value === HINT_CROSS);
    if (wasHint || isHintMark(value)) syncOriginMarks();
    if (state.reasonMode && hadMarks !== layerHasMarks(state.reasonDepth)) syncReasonUi();
    persistDraft();
  }

  function setCross(r, c, value) {
    setMark(r, c, value);
  }

  function toggleCross(r, c) {
    if (state.status !== "playing") return;
    if (state.marks[r][c] === STAR) return;
    setMark(r, c, state.marks[r][c] === CROSS ? EMPTY : CROSS);
  }

  function toggleHint(r, c, kind) {
    if (state.status !== "playing") return;
    if (state.marks[r][c] === STAR || state.marks[r][c] === CROSS) return;
    if (isLockedHint(r, c)) return;
    setMark(r, c, state.marks[r][c] === kind ? EMPTY : kind);
  }

  function startPaint(r, c, kind) {
    if (state.status !== "playing") return;
    if (state.marks[r][c] === STAR) return;
    if (isLockedHint(r, c)) return;
    if (isHintMark(kind) && state.marks[r][c] === CROSS) return;
    if (kind === HINT_STAR && state.marks[r][c] === HINT_CROSS) return;
    var next = state.marks[r][c] === kind ? EMPTY : kind;
    state.crossPaint = { value: next, kind: kind };
    applyPaint(r, c);
  }

  function applyPaint(r, c) {
    if (!state.crossPaint) return;
    if (state.marks[r][c] === STAR) return;
    if (isLockedHint(r, c)) return;
    if (isHintMark(state.crossPaint.kind) && state.marks[r][c] === CROSS) return;
    if (state.crossPaint.kind === HINT_STAR && state.marks[r][c] === HINT_CROSS) return;
    if (state.crossPaint.value === EMPTY) {
      if (state.marks[r][c] !== state.crossPaint.kind) return;
      setMark(r, c, EMPTY);
      return;
    }
    setMark(r, c, state.crossPaint.kind);
  }

  function startCrossPaint(r, c) {
    startPaint(r, c, state.reasonMode ? HINT_CROSS : CROSS);
  }

  function paintCrossAtPoint(clientX, clientY) {
    if (!state.crossPaint) return;
    var el = document.elementFromPoint(clientX, clientY);
    var cell = el && el.closest ? el.closest(".cell") : null;
    if (!cell || !els.board.contains(cell)) return;
    applyPaint(Number(cell.dataset.r), Number(cell.dataset.c));
  }

  function endCrossPaint() {
    state.crossPaint = null;
  }

  function isTouchPointer(e) {
    return e.pointerType === "touch" || e.pointerType === "pen";
  }

  function onTouchStar(r, c) {
    if (isLockedHint(r, c)) return;
    if (state.marks[r][c] === CROSS || state.marks[r][c] === HINT_CROSS) {
      setMark(r, c, EMPTY);
    }
    if (state.reasonMode) toggleHint(r, c, HINT_STAR);
    else tryPlaceStar(r, c);
  }

  function onCellPointerDown(e) {
    var r = Number(e.currentTarget.dataset.r);
    var c = Number(e.currentTarget.dataset.c);
    if (isTouchPointer(e)) {
      state.coarsePointer = true;
      state.ignoreClickUntil = Date.now() + 700;
      refreshHintText();
      e.preventDefault();
      var now = Date.now();
      var last = state.lastTouchTap;
      if (last && last.r === r && last.c === c && !last.moved && now - last.at <= 400) {
        state.lastTouchTap = null;
        endCrossPaint();
        onTouchStar(r, c);
        return;
      }
      state.lastTouchTap = { r: r, c: c, at: now, moved: false };
      startCrossPaint(r, c);
      return;
    }
    var right = e.button === 2;
    var left = e.button === 0;
    var crossMode = state.mode === "cross" && left;
    var reasonStar = state.reasonMode && left && state.mode !== "cross";
    if (reasonStar) {
      e.preventDefault();
      startPaint(r, c, HINT_STAR);
      return;
    }
    if (!right && !crossMode) return;
    e.preventDefault();
    startCrossPaint(r, c);
  }

  function onCellClick(e) {
    if (Date.now() < state.ignoreClickUntil) return;
    if (state.reasonMode) return;
    if (state.mode === "cross") return;
    tryPlaceStar(Number(e.currentTarget.dataset.r), Number(e.currentTarget.dataset.c));
  }

  function commitReasonMarks() {
    if (state.status !== "playing" || !state.puzzle) return;
    var n = state.puzzle.n;
    var pendingStars = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (state.marks[r][c] === HINT_CROSS) setMark(r, c, CROSS);
        else if (state.marks[r][c] === HINT_STAR) pendingStars.push([r, c]);
      }
    }
    for (var i = 0; i < pendingStars.length; i++) {
      if (state.status !== "playing") return;
      var cell = pendingStars[i];
      if (state.marks[cell[0]][cell[1]] !== HINT_STAR) continue;
      state.marks[cell[0]][cell[1]] = EMPTY;
      state.layers[cell[0]][cell[1]] = 0;
      state.order[cell[0]][cell[1]] = 0;
      tryPlaceStar(cell[0], cell[1]);
    }
    syncOriginMarks();
  }

  function setReasonMode(on) {
    var next = !!on;
    if (next === state.reasonMode) {
      syncReasonUi();
      return;
    }
    if (state.reasonMode && !next) commitReasonMarks();
    state.reasonMode = next;
    state.reasonDepth = 1;
    syncReasonUi();
    persistDraft();
  }

  function onCellContext(e) {
    e.preventDefault();
  }

  function clearShowcaseTimer() {
    if (state.showcaseTimer) {
      clearTimeout(state.showcaseTimer);
      state.showcaseTimer = null;
    }
  }

  function playWinShowcase(done) {
    els.board.classList.add("is-showcase");
    var stars = els.board.querySelectorAll(".cell");
    var delay = 0;
    var count = 0;
    for (var i = 0; i < stars.length; i++) {
      var btn = stars[i];
      var r = Number(btn.dataset.r);
      var c = Number(btn.dataset.c);
      if (state.marks[r][c] !== STAR) continue;
      btn.classList.add("is-gold");
      btn.innerHTML = goldStarHtml();
      var flip = btn.querySelector(".gold-flip");
      if (flip) flip.style.animationDelay = count * 70 + "ms";
      delay = count * 70;
      count += 1;
    }
    state.showcaseTimer = setTimeout(function () {
      state.showcaseTimer = null;
      done();
    }, delay + 1100);
  }

  function showWinOverlay() {
    els.resultDialog.classList.remove("is-lose");
    els.resultKicker.textContent = "第 " + state.level + " 關通過";
    els.resultTitle.textContent = "征途走完了";
    els.resultCopy.textContent = "用時 " + formatTime(state.elapsed) + "。九百九十九關都過了。";
    els.resultNext.textContent = "返回選單";
    els.resultOverlay.hidden = false;
  }

  function endGame(won) {
    state.status = won ? "won" : "lost";
    state.elapsed = currentElapsed();
    stopTimer();
    if (!won) {
      renderBoard();
      els.resultDialog.classList.add("is-lose");
      state.save.draft = null;
      if (!puzzleLib().isTestLevel(state.level)) state.save.lastLevel = state.level;
      writeSave();
      els.resultKicker.textContent = "機會用盡";
      els.resultTitle.textContent = "這關先到這裡";
      els.resultCopy.textContent = "標錯星星，這一關從頭再來。進度仍停在這一關。";
      els.resultNext.textContent = "再試本關";
      els.resultOverlay.hidden = false;
      renderLobby();
      return;
    }
    if (puzzleLib().isTestLevel(state.level)) {
      var clearedTests = state.save.testCleared || [];
      if (clearedTests.indexOf(state.level) < 0) clearedTests.push(state.level);
      state.save.testCleared = clearedTests;
      state.save.draft = null;
      writeSave();
      renderLobby();
      playWinShowcase(function () {
        if (state.status !== "won") return;
        var nextTest = state.level + 1;
        if (puzzleLib().isTestLevel(nextTest)) {
          startLevel(nextTest, true);
          return;
        }
        showTestWinOverlay();
      });
      return;
    }
    state.save.clearedUpTo = Math.max(state.save.clearedUpTo || 0, state.level);
    state.save.lastLevel = Math.min(totalLevels(), state.level + 1);
    state.save.draft = null;
    writeSave();
    renderLobby();
    playWinShowcase(function () {
      if (state.status !== "won") return;
      if (state.level >= totalLevels()) {
        showWinOverlay();
        return;
      }
      startLevel(state.level + 1, true);
    });
  }

  function showTestWinOverlay() {
    els.resultDialog.classList.remove("is-lose");
    var spec = puzzleLib().levelSpec(state.level);
    els.resultKicker.textContent = spec.label + " " + (state.level - puzzleLib().TEST_LEVEL_BASE) + " 通過";
    els.resultTitle.textContent = "這題測完了";
    els.resultCopy.textContent = "用時 " + formatTime(state.elapsed) + "。測試關不計入征途進度。";
    els.resultNext.textContent = "返回選單";
    els.resultOverlay.hidden = false;
  }

  function emptyMarks(n) {
    return Array.from({ length: n }, function () {
      return Array(n).fill(EMPTY);
    });
  }

  function restoreLayers(draft, n) {
    var saved = draft.layers && draft.layers.length === n ? draft.layers : null;
    return draft.marks.map(function (row, r) {
      return row.map(function (mark, c) {
        if (!isHintMark(mark)) return 0;
        var layer = saved && saved[r] ? saved[r][c] | 0 : 0;
        return layer >= 1 && layer <= MAX_REASON_DEPTH ? layer : 1;
      });
    });
  }

  function restoreOrder(draft, n) {
    var saved = draft.order && draft.order.length === n ? draft.order : null;
    var seq = 0;
    return draft.marks.map(function (row, r) {
      return row.map(function (mark, c) {
        if (!isHintMark(mark)) return 0;
        var value = saved && saved[r] ? saved[r][c] | 0 : 0;
        return value > 0 ? value : ++seq;
      });
    });
  }

  function stopScoreAnim() {
    if (state.scoreAnimId) {
      cancelAnimationFrame(state.scoreAnimId);
      state.scoreAnimId = null;
    }
  }

  function animateScore(raw) {
    stopScoreAnim();
    var target = raw == null || raw !== raw ? 0 : Math.max(0, Math.round(raw));
    if (els.scoreWrap) {
      els.scoreWrap.setAttribute("aria-label", target ? "難度指數 " + target : "難度指數");
    }
    if (!els.scoreLabel || !els.scoreFill) return;

    els.scoreLabel.textContent = "0";
    els.scoreFill.style.transition = "none";
    els.scoreFill.style.height = "";
    els.scoreFill.style.clipPath = "inset(100% 0 0 0)";
    void els.scoreFill.offsetHeight;

    if (!target) return;

    var duration = 3000;
    els.scoreFill.style.transition = "clip-path " + duration + "ms cubic-bezier(0.33, 0, 0.2, 1)";
    els.scoreFill.style.clipPath = "inset(" + (100 - target) + "% 0 0 0)";

    var started = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - started) / duration);
      var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      els.scoreLabel.textContent = String(Math.round(target * eased));
      if (t < 1) {
        state.scoreAnimId = requestAnimationFrame(tick);
        return;
      }
      els.scoreLabel.textContent = String(target);
      state.scoreAnimId = null;
    }
    state.scoreAnimId = requestAnimationFrame(tick);
  }

  function applyPlayState(puzzle, draft) {
    state.puzzle = puzzle;
    if (draft && draft.marks && draft.marks.length === puzzle.n) {
      state.marks = draft.marks.map(function (row) {
        return row.slice();
      });
      state.layers = restoreLayers(draft, puzzle.n);
      state.order = restoreOrder(draft, puzzle.n);
      state.orderSeq = state.order.reduce(function (max, row) {
        return Math.max(max, Math.max.apply(null, row));
      }, 0);
      state.lives = 1;
      if (typeof draft.reasonMode === "boolean") state.reasonMode = draft.reasonMode;
      state.reasonDepth = Math.max(1, Math.min(MAX_REASON_DEPTH, draft.reasonDepth | 0 || 1));
      startTimer(draft.elapsed || 0);
    } else {
      state.marks = emptyMarks(puzzle.n);
      state.layers = emptyMarks(puzzle.n);
      state.order = emptyMarks(puzzle.n);
      state.orderSeq = 0;
      state.reasonDepth = 1;
      state.lives = 1;
      startTimer(0);
    }
    state.status = "playing";
    els.resultOverlay.hidden = true;
    renderLives();
    renderBoard();
    syncReasonUi();
    persistDraft();
  }

  function startLevel(level, forceFresh) {
    clearShowcaseTimer();
    els.board.classList.remove("is-showcase");
    var lib = puzzleLib();
    if (!lib || typeof lib.generateLevel !== "function") return;
    var testing = lib.isTestLevel(level);
    if (!testing) {
      level = Math.max(1, Math.min(totalLevels(), level | 0));
      if (!isUnlocked(level)) level = unlockedLevel();
      state.save.lastLevel = level;
    }
    state.level = level;
    var spec = lib.levelSpec(level);
    els.difficultyLabel.textContent = testing
      ? spec.label + " " + (level - lib.TEST_LEVEL_BASE) + " · " + spec.n + "×" + spec.n
      : "第 " + level + " 關 · " + spec.label + " " + spec.n + "×" + spec.n;
    showScreen("play");
    els.board.innerHTML = "";
    var draft =
      !forceFresh && state.save.draft && state.save.draft.level === level ? state.save.draft : null;
    var puzzle = lib.generateLevel(level);
    // Keep cleared progress, but never apply marks from a previous campaign
    // board to a replacement puzzle at the same level number.
    if (draft && draft.boardKey !== lib.puzzleKey(puzzle)) draft = null;
    var rated =
      puzzle.rating ||
      (typeof lib.scoreDifficulty === "function" ? lib.scoreDifficulty(puzzle.regions) : null);
    var score = rated ? rated.score : puzzle.difficulty;
    animateScore(score);
    applyPlayState(puzzle, draft);
    writeSave();
  }

  function openRules() {
    els.rulesOverlay.hidden = false;
  }

  function closeRules() {
    els.rulesOverlay.hidden = true;
  }

  function updatePointerMode(e) {
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      state.coarsePointer = true;
      refreshHintText();
    }
  }

  function emptyDesignColors() {
    return Array.from({ length: 9 }, function () {
      return Array(9).fill(-1);
    });
  }

  function rollDesignStars(previous) {
    var lib = puzzleLib();
    var prevKey = previous ? previous.join(",") : "";
    var stars = null;
    for (var i = 0; i < 80; i++) {
      stars = lib.generateStarPlacement(9);
      if (stars && lib.starsAreLegal(stars) && stars.join(",") !== prevKey) return stars.slice();
    }
    return DESIGN_BLANK_STARS.slice();
  }

  function cancelDesignScore() {
    if (design.scoreTimer) {
      clearTimeout(design.scoreTimer);
      design.scoreTimer = null;
    }
    design.scoreDocked = false;
    if (!els.designScore) return;
    els.designScore.hidden = true;
    els.designScore.className = "design-score";
    els.designScore.style.cssText = "";
    els.designScore.textContent = "";
    els.designScore.removeAttribute("aria-label");
  }

  function clearDesignNote() {
    if (!els.designReasons) return;
    els.designReasons.hidden = true;
    els.designReasons.classList.remove("is-wait");
    els.designReasonList.innerHTML = "";
  }

  function showDesignNote(title, lines, waiting) {
    els.designReasons.hidden = false;
    els.designReasons.classList.toggle("is-wait", !!waiting);
    els.designReasonTitle.textContent = title;
    els.designReasonList.innerHTML = "";
    lines.forEach(function (line) {
      var item = document.createElement("li");
      item.textContent = line;
      els.designReasonList.appendChild(item);
    });
  }

  function designEdgeClass(r, c) {
    var id = design.colors[r][c];
    if (id < 0) return "";
    var cls = "";
    var specs = [
      ["edge-t", r - 1, c],
      ["edge-b", r + 1, c],
      ["edge-l", r, c - 1],
      ["edge-r", r, c + 1],
    ];
    for (var i = 0; i < specs.length; i++) {
      var nr = specs[i][1];
      var nc = specs[i][2];
      if (nr < 0 || nc < 0 || nr >= 9 || nc >= 9 || design.colors[nr][nc] !== id) cls += " " + specs[i][0];
    }
    return cls;
  }

  function designHintAt(r, c) {
    var cells = design.hintCells;
    if (!cells) return false;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] === r && cells[i][1] === c) return true;
    }
    return false;
  }

  function clearDesignHint() {
    design.alt = null;
    design.hintCells = [];
    design.hintColor = -1;
    if (els.designApply) els.designApply.hidden = true;
  }

  function syncDesignCell(r, c) {
    var btn = els.designBoard.querySelector('[data-r="' + r + '"][data-c="' + c + '"]');
    if (!btn) return;
    var id = design.colors[r][c];
    var star = design.stars[r] === c;
    var alt = !!(design.alt && design.alt[r] === c && !star);
    var hinted = designHintAt(r, c);
    var names = puzzleLib().designColorNames || [];
    btn.className =
      "cell" +
      (star ? " is-given-star" : "") +
      (alt ? " is-alt-star" : "") +
      (hinted ? " is-design-hint" : "") +
      designEdgeClass(r, c);
    btn.style.background = id < 0 ? "" : COLORS[id % COLORS.length];
    var label = r + 1 + " 列 " + (c + 1) + " 行，" + (id < 0 ? "未上色" : (names[id] || "") + "色");
    if (star) label += "，有星星";
    if (alt) label += "，另一種擺法";
    if (hinted) label += "，建議改成" + ((names[design.hintColor] || "") + "色");
    btn.setAttribute("aria-label", label);
    if (star) btn.innerHTML = starSvg();
    else if (alt) btn.innerHTML = altStarSvg();
    else btn.innerHTML = "";
  }

  function renderDesignBoard() {
    var board = els.designBoard;
    board.style.gridTemplateColumns = "repeat(9, minmax(0, 1fr))";
    board.innerHTML = "";
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        var btn = document.createElement("div");
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.setAttribute("role", "gridcell");
        board.appendChild(btn);
        syncDesignCell(r, c);
      }
    }
  }

  function paintDesign(r, c) {
    if (design.locked || design.judging) return;
    if (r < 0 || c < 0 || r >= 9 || c >= 9) return;
    if (design.colors[r][c] === design.brush) return;
    design.colors[r][c] = design.brush;
    syncDesignCell(r, c);
    syncDesignCell(r - 1, c);
    syncDesignCell(r + 1, c);
    syncDesignCell(r, c - 1);
    syncDesignCell(r, c + 1);
  }

  function ensureDesignPalette() {
    if (els.designPalette.childElementCount) {
      updateDesignBrush();
      return;
    }
    var names = puzzleLib().designColorNames || [];
    COLORS.forEach(function (color, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch";
      btn.style.background = color;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-label", (names[index] || "顏色 " + (index + 1)) + "色");
      btn.addEventListener("click", function () {
        if (design.locked || design.judging) return;
        design.brush = index;
        updateDesignBrush();
      });
      els.designPalette.appendChild(btn);
    });
    updateDesignBrush();
  }

  function updateDesignBrush() {
    var swatches = els.designPalette.querySelectorAll(".swatch");
    for (var i = 0; i < swatches.length; i++) {
      var on = i === design.brush;
      swatches[i].classList.toggle("is-selected", on);
      swatches[i].setAttribute("aria-checked", on ? "true" : "false");
    }
  }

  function setDesignBusy(busy) {
    design.judging = busy;
    var frozen = busy || design.locked;
    els.designRegen.disabled = busy;
    els.designRestart.disabled = busy;
    if (els.designApply) els.designApply.disabled = busy;
    els.designSubmit.disabled = frozen;
    els.designSubmit.textContent = busy ? "判定中…" : "送交";
    els.designPalette.classList.toggle("is-locked", frozen);
    els.designBoard.classList.toggle("is-locked", frozen);
  }

  function beginDesign(newStars) {
    cancelDesignScore();
    design.locked = false;
    design.judging = false;
    design.painting = false;
    if (newStars || !design.stars) design.stars = rollDesignStars(newStars ? design.stars : null);
    design.colors = emptyDesignColors();
    clearDesignHint();
    setDesignBusy(false);
    clearDesignNote();
    els.designHint.textContent = "選一種顏色，點格子或拖曳上色。星星是系統給的。";
    ensureDesignPalette();
    renderDesignBoard();
    showScreen("design");
  }

  function leaveDesign() {
    cancelDesignScore();
    design.painting = false;
    design.locked = false;
    design.judging = false;
    showScreen("lobby");
    renderLobby();
  }

  function placeDesignScore(el, point, size, animate) {
    if (!animate) el.style.transition = "none";
    el.style.left = point.x + "px";
    el.style.top = point.y + "px";
    el.style.transform = "translate(-50%, -50%)";
    if (size) el.style.fontSize = size;
    if (!animate) {
      void el.offsetWidth;
      el.style.transition = "";
    }
  }

  function designScorePoint() {
    var rect = els.designScoreAnchor.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function designScoreDockSize() {
    return window.innerWidth < 640 ? "28px" : "40px";
  }

  function flyDesignScore() {
    var el = els.designScore;
    var size = window.getComputedStyle(el).fontSize;
    el.className = "design-score is-dock";
    placeDesignScore(el, { x: window.innerWidth / 2, y: window.innerHeight / 2 }, size, false);
    requestAnimationFrame(function () {
      placeDesignScore(el, designScorePoint(), designScoreDockSize(), true);
      design.scoreDocked = true;
    });
  }

  function presentDesignScore(score) {
    cancelDesignScore();
    var el = els.designScore;
    el.hidden = false;
    el.textContent = String(score);
    el.setAttribute("aria-label", "難度分數 " + score);
    el.className = "design-score is-pop";
    placeDesignScore(el, { x: window.innerWidth / 2, y: window.innerHeight / 2 }, "", true);
    design.scoreTimer = setTimeout(function () {
      design.scoreTimer = null;
      flyDesignScore();
    }, 880);
  }

  function submitDesign() {
    if (design.locked || design.judging || !design.colors || !design.stars) return;
    var lib = puzzleLib();
    setDesignBusy(true);
    showDesignNote("判定中", ["正在檢查成題條件。"], true);
    setTimeout(function () {
      var report;
      try {
        report = lib.explainDesign(design.colors, design.stars);
      } catch (err) {
        setDesignBusy(false);
        showDesignNote("不成題", ["檢查時發生問題，請再送交一次。"], false);
        return;
      }
      if (!report.ok) {
        design.alt = report.alt || null;
        design.hintCells = report.hint && report.hint.cells ? report.hint.cells : [];
        design.hintColor = report.hint ? report.hint.colorId : -1;
        setDesignBusy(false);
        showDesignNote("不成題", report.reasons, false);
        if (els.designApply) els.designApply.hidden = !design.hintCells.length;
        renderDesignBoard();
        if (design.alt) {
          els.designHint.textContent = "空心星是另一種擺法。把虛線格子改成同一色，這個擺法就會消失。";
        }
        return;
      }
      showDesignNote("判定中", ["成題了，正在計算難度。"], true);
      setTimeout(function () {
        var rated;
        try {
          rated = lib.scoreDifficulty(design.colors, design.stars);
        } catch (err) {
          setDesignBusy(false);
          showDesignNote("無法評分", ["這盤符合成題條件，但這次沒能算出難度分數。"], false);
          return;
        }
        design.locked = true;
        clearDesignHint();
        setDesignBusy(false);
        clearDesignNote();
        els.designHint.textContent = "難度分數會留在盤面右上角，可以截圖。重新設計會保留這組星星。";
        presentDesignScore(rated.score);
      }, 30);
    }, 30);
  }

  document.getElementById("open-design").addEventListener("click", function () {
    beginDesign(true);
  });
  document.getElementById("design-back").addEventListener("click", leaveDesign);
  els.designRegen.addEventListener("click", function () {
    if (design.judging) return;
    beginDesign(true);
  });
  els.designRestart.addEventListener("click", function () {
    if (design.judging) return;
    beginDesign(false);
  });
  function applyDesignHint() {
    if (design.locked || design.judging || !design.hintCells.length) return;
    for (var i = 0; i < design.hintCells.length; i++) {
      design.colors[design.hintCells[i][0]][design.hintCells[i][1]] = design.hintColor;
    }
    clearDesignHint();
    renderDesignBoard();
    showDesignNote("已照提示改色", ["這個擺法已經拆掉。再送交一次；若還有別的擺法，會再標出下一組空心星。"], true);
    els.designHint.textContent = "改完再送交。還有別的擺法時，會再標出下一組空心星。";
  }

  els.designSubmit.addEventListener("click", submitDesign);
  els.designApply.addEventListener("click", applyDesignHint);
  els.designBoard.addEventListener("pointerdown", function (e) {
    if (design.locked || design.judging) return;
    var cell = e.target.closest ? e.target.closest(".cell") : null;
    if (!cell || !els.designBoard.contains(cell)) return;
    design.painting = true;
    e.preventDefault();
    paintDesign(Number(cell.dataset.r), Number(cell.dataset.c));
  });
  els.designBoard.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
  function stickDesignScore() {
    if (!design.scoreDocked || !els.designScore) return;
    placeDesignScore(els.designScore, designScorePoint(), designScoreDockSize(), false);
  }
  window.addEventListener("resize", stickDesignScore);
  document.addEventListener("scroll", stickDesignScore, true);

  document.getElementById("open-rules").addEventListener("click", openRules);
  document.getElementById("play-rules").addEventListener("click", openRules);
  document.getElementById("close-rules").addEventListener("click", closeRules);
  els.rulesOverlay.addEventListener("click", function (e) {
    if (e.target === els.rulesOverlay) closeRules();
  });

  document.getElementById("open-levels").addEventListener("click", function () {
    var lib = puzzleLib();
    var spec = lib.levelSpec(state.save.lastLevel || 1);
    state.catalogChapter = lib.CHAPTERS.findIndex(function (ch) {
      return spec.n === ch.n;
    });
    if (state.catalogChapter < 0) state.catalogChapter = 0;
    state.catalogPage = Math.floor((state.save.lastLevel - spec.from) / PAGE_SIZE);
    els.levelsOverlay.hidden = false;
    renderCatalog();
  });
  document.getElementById("close-levels").addEventListener("click", function () {
    els.levelsOverlay.hidden = true;
  });
  els.levelsOverlay.addEventListener("click", function (e) {
    if (e.target === els.levelsOverlay) els.levelsOverlay.hidden = true;
  });
  document.getElementById("level-prev").addEventListener("click", function () {
    state.catalogPage -= 1;
    renderCatalog();
  });
  document.getElementById("level-next").addEventListener("click", function () {
    state.catalogPage += 1;
    renderCatalog();
  });

  document.getElementById("back-lobby").addEventListener("click", function () {
    persistDraft(true);
    clearShowcaseTimer();
    stopScoreAnim();
    els.board.classList.remove("is-showcase");
    stopTimer();
    state.status = "idle";
    showScreen("lobby");
    renderLobby();
  });

  document.getElementById("restart-same").addEventListener("click", function () {
    startLevel(state.level, true);
  });

  document.getElementById("result-next").addEventListener("click", function () {
    els.resultOverlay.hidden = true;
    if (state.status === "won") {
      var lib = puzzleLib();
      var nextTest = state.level + 1;
      if (lib.isTestLevel(state.level)) {
        if (lib.isTestLevel(nextTest)) {
          startLevel(nextTest, true);
          return;
        }
        stopTimer();
        state.status = "idle";
        showScreen("lobby");
        renderLobby();
        return;
      }
      if (state.level >= totalLevels()) {
        stopTimer();
        state.status = "idle";
        showScreen("lobby");
        renderLobby();
        return;
      }
      startLevel(state.level + 1, true);
      return;
    }
    startLevel(state.level, true);
  });

  document.getElementById("result-home").addEventListener("click", function () {
    els.resultOverlay.hidden = true;
    stopTimer();
    state.status = "idle";
    showScreen("lobby");
    renderLobby();
  });

  els.reasonToggle.addEventListener("change", function () {
    setReasonMode(els.reasonToggle.checked);
  });

  els.clearReason.addEventListener("click", function () {
    clearReasonMarks();
  });

  els.reasonNext.addEventListener("click", nextReasonLayer);
  els.reasonBack.addEventListener("click", backtrackReasonLayer);

  window.addEventListener("pointerdown", updatePointerMode, { once: true });
  var lastTouchEndAt = 0;
  document.addEventListener(
    "touchend",
    function (e) {
      var now = Date.now();
      if (now - lastTouchEndAt <= 400) e.preventDefault();
      lastTouchEndAt = now;
    },
    { passive: false }
  );
  document.addEventListener(
    "gesturestart",
    function (e) {
      e.preventDefault();
    },
    { passive: false }
  );
  els.board.addEventListener("dblclick", function (e) {
    e.preventDefault();
  });
  document.addEventListener("pointermove", function (e) {
    if (design.painting) {
      var painted = document.elementFromPoint(e.clientX, e.clientY);
      var designCell = painted && painted.closest ? painted.closest(".cell") : null;
      if (designCell && els.designBoard.contains(designCell)) {
        paintDesign(Number(designCell.dataset.r), Number(designCell.dataset.c));
      }
    }
    if (!state.crossPaint) return;
    var last = state.lastTouchTap;
    if (last) {
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var cell = el && el.closest ? el.closest(".cell") : null;
      if (cell && els.board.contains(cell)) {
        if (Number(cell.dataset.r) !== last.r || Number(cell.dataset.c) !== last.c) last.moved = true;
      }
    }
    paintCrossAtPoint(e.clientX, e.clientY);
  });
  document.addEventListener("pointerup", function () {
    design.painting = false;
    endCrossPaint();
  });
  document.addEventListener("pointercancel", function () {
    design.painting = false;
    endCrossPaint();
  });
  window.addEventListener("blur", function () {
    design.painting = false;
    endCrossPaint();
  });
  els.board.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
  window.addEventListener("beforeunload", function () {
    persistDraft(true);
  });

  state.save = loadSave();
  renderLobby();
  renderLives();
})();
