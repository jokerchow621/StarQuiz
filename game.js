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
  };

  var state = {
    level: 1,
    puzzle: null,
    marks: [],
    lives: 1,
    status: "idle",
    mode: "star",
    reasonMode: false,
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

  function puzzleLib() {
    if (typeof Puzzle !== "undefined") return Puzzle;
    return window.Puzzle;
  }

  function totalLevels() {
    var lib = puzzleLib();
    return lib && lib.TOTAL_LEVELS ? lib.TOTAL_LEVELS : 999;
  }

  function defaultSave() {
    return { v: 1, lastLevel: 1, clearedUpTo: 0, draft: null };
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      var data = JSON.parse(raw);
      if (!data || data.v !== 1) return defaultSave();
      data.lastLevel = Math.max(1, Math.min(totalLevels(), data.lastLevel | 0));
      data.clearedUpTo = Math.max(0, Math.min(totalLevels(), data.clearedUpTo | 0));
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

  function isUnlocked(level) {
    return level <= unlockedLevel();
  }

  function showScreen(name) {
    els.lobby.dataset.visible = name === "lobby" ? "true" : "false";
    els.play.dataset.visible = name === "play" ? "true" : "false";
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
    state.save.lastLevel = state.level;
    state.save.draft = {
      level: state.level,
      marks: state.marks.map(function (row) {
        return row.slice();
      }),
      lives: 1,
      elapsed: currentElapsed(),
      reasonMode: !!state.reasonMode,
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
    var resume = state.save.draft && state.save.draft.level ? state.save.draft.level : state.save.lastLevel;
    if (!isUnlocked(resume)) resume = next;
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

  function renderCatalog() {
    var lib = puzzleLib();
    var chapters = lib.CHAPTERS;
    var chapter = chapters[state.catalogChapter] || chapters[0];
    els.chapterTabs.innerHTML = "";
    chapters.forEach(function (ch, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chapter-tab" + (idx === state.catalogChapter ? " is-active" : "");
      btn.textContent = ch.label + " " + ch.n + "×" + ch.n;
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
    els.levelGrid.innerHTML = "";
    for (var lv = start; lv <= end; lv++) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "level-cell";
      if (isCleared(lv)) cell.classList.add("is-cleared");
      if (lv === state.save.lastLevel) cell.classList.add("is-current");
      if (!isUnlocked(lv)) {
        cell.classList.add("is-locked");
        cell.disabled = true;
      }
      cell.textContent = String(lv);
      cell.addEventListener("click", function (level) {
        return function () {
          els.levelsOverlay.hidden = true;
          startLevel(level);
        };
      }(lv));
      els.levelGrid.appendChild(cell);
    }
    els.levelPage.textContent = start + "–" + end + " / " + chapter.from + "–" + chapter.to;
    document.getElementById("level-prev").disabled = state.catalogPage <= 0;
    document.getElementById("level-next").disabled = state.catalogPage >= pages - 1;
  }

  function renderLives() {}

  function starSvg() {
    return '<svg class="mark mark-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.55 6.08 6.6.58-5.03 4.28 1.55 6.44L12 17.7 6.33 20.58 7.88 14.14 2.85 9.86l6.6-.58z"/></svg>';
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

  function hintBadge() {
    return '<span class="hint-q">?</span>';
  }

  function markHtml(mark) {
    if (mark === STAR) return starSvg();
    if (mark === CROSS) return crossSvg();
    if (mark === HINT_STAR) return starSvg() + hintBadge();
    if (mark === HINT_CROSS) return crossSvg() + hintBadge();
    return "";
  }

  function syncReasonUi() {
    if (els.reasonToggle) els.reasonToggle.checked = !!state.reasonMode;
    if (els.boardStage) els.boardStage.classList.toggle("is-reason", !!state.reasonMode);
    if (els.clearReason) els.clearReason.disabled = !state.reasonMode;
    refreshHintText();
  }

  function clearReasonMarks() {
    if (state.status !== "playing" || !state.reasonMode || !state.marks.length) return;
    var n = state.marks.length;
    var changed = false;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var mark = state.marks[r][c];
        if (mark !== HINT_STAR && mark !== HINT_CROSS) continue;
        state.marks[r][c] = EMPTY;
        updateCell(r, c);
        changed = true;
      }
    }
    if (changed) persistDraft();
  }

  function refreshHintText() {
    if (state.reasonMode) {
      els.hint.textContent = state.coarsePointer
        ? "推理中：單擊問號叉叉可滑動 · 雙擊問號星星"
        : "推理中：左鍵問號星星 · 右鍵問號叉叉";
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
        var btn = document.createElement("button");
        btn.type = "button";
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
    state.save.lastLevel = state.level;
    writeSave();
    setTimeout(function () {
      startLevel(state.level, true);
    }, 420);
  }

  function paintCellContent(btn, mark, r, c, drop) {
    btn.classList.toggle("is-hint", mark === HINT_STAR || mark === HINT_CROSS);
    btn.classList.remove("is-dropping");
    btn.innerHTML = markHtml(mark);
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
    state.marks[r][c] = value;
    updateCell(r, c, value === STAR || value === CROSS || value === HINT_STAR || value === HINT_CROSS);
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
    setMark(r, c, state.marks[r][c] === kind ? EMPTY : kind);
  }

  function startPaint(r, c, kind) {
    if (state.status !== "playing") return;
    if (state.marks[r][c] === STAR) return;
    if (isHintMark(kind) && state.marks[r][c] === CROSS) return;
    if (kind === HINT_STAR && state.marks[r][c] === HINT_CROSS) return;
    var next = state.marks[r][c] === kind ? EMPTY : kind;
    state.crossPaint = { value: next, kind: kind };
    applyPaint(r, c);
  }

  function applyPaint(r, c) {
    if (!state.crossPaint) return;
    if (state.marks[r][c] === STAR) return;
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
      tryPlaceStar(cell[0], cell[1]);
    }
  }

  function setReasonMode(on) {
    var next = !!on;
    if (next === state.reasonMode) {
      syncReasonUi();
      return;
    }
    if (state.reasonMode && !next) commitReasonMarks();
    state.reasonMode = next;
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
      state.save.lastLevel = state.level;
      writeSave();
      els.resultKicker.textContent = "機會用盡";
      els.resultTitle.textContent = "這關先到這裡";
      els.resultCopy.textContent = "標錯星星，這一關從頭再來。進度仍停在這一關。";
      els.resultNext.textContent = "再試本關";
      els.resultOverlay.hidden = false;
      renderLobby();
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

  function emptyMarks(n) {
    return Array.from({ length: n }, function () {
      return Array(n).fill(EMPTY);
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
      state.lives = 1;
      if (typeof draft.reasonMode === "boolean") state.reasonMode = draft.reasonMode;
      startTimer(draft.elapsed || 0);
    } else {
      state.marks = emptyMarks(puzzle.n);
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
    level = Math.max(1, Math.min(totalLevels(), level | 0));
    if (!isUnlocked(level)) level = unlockedLevel();
    state.level = level;
    state.save.lastLevel = level;
    var spec = lib.levelSpec(level);
    els.difficultyLabel.textContent = "第 " + level + " 關 · " + spec.label + " " + spec.n + "×" + spec.n;
    showScreen("play");
    els.board.innerHTML = "";
    var draft =
      !forceFresh && state.save.draft && state.save.draft.level === level ? state.save.draft : null;
    var puzzle = lib.generateLevel(level);
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

  window.addEventListener("pointerdown", updatePointerMode, { once: true });
  document.addEventListener("pointermove", function (e) {
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
  document.addEventListener("pointerup", endCrossPaint);
  document.addEventListener("pointercancel", endCrossPaint);
  window.addEventListener("blur", endCrossPaint);
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
