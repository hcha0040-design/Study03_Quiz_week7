// 순수 로직: DOM과 localStorage에 손대지 않고, 입력을 바꾸지 않는다.
const QuizCore = {
  // 피셔-예이츠: 사본을 만들어 뒤에서부터 바꾼다. rng는 0 이상 1 미만 값을 돌려준다.
  shuffle(arr, rng) {
    const out = arr.slice();
    for (let i = out.length - 1; i >= 1; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  },

  questionsByCategory(questions, categoryId) {
    return questions.filter(q => q.category === categoryId);
  },

  // 문항 순서와 보기 순서를 섞고, 원래 정답이 옮겨 간 위치를 answerIndex로 돌려준다.
  prepareItems(questionList, rng) {
    return QuizCore.shuffle(questionList, rng).map(q => {
      const order = QuizCore.shuffle([0, 1, 2, 3], rng);
      return {
        id: q.id,
        question: q.question,
        choices: order.map(i => q.choices[i]),
        answerIndex: order.indexOf(q.answer),
        explanation: q.explanation,
        source: { ...q.source },
      };
    });
  },

  // 반점 단위 점수: 정답 2, 힌트를 쓴 정답 1, 오답 0.
  scoreAnswer({ correct, usedHint }) {
    if (!correct) return 0;
    return usedHint ? 1 : 2;
  },

  // 반점 정수를 화면용 문자열로 바꾼다(15 -> "7.5"). 단독 함수로 넘겨도 되도록 this를 쓰지 않는다.
  formatScore(halfPoints) {
    return String(halfPoints / 2);
  },

  // 스피드 모드 한 문항의 제한 시간(ms).
  SPEED_LIMIT_MS: 15000,

  // 힌트로 지울 오답 2개의 위치(섞은 뒤 기준, 오름차순). 정답이 아닌 위치 3개를 섞어 앞의 2개를 고른다.
  pickHintRemovals(item, rng) {
    const wrong = [0, 1, 2, 3].filter(i => i !== item.answerIndex);
    return QuizCore.shuffle(wrong, rng).slice(0, 2).sort((a, b) => a - b);
  },

  wrongQuestionIds(results) {
    return results.filter(r => !r.correct).map(r => r.questionId);
  },

  // 결과 목록에 붙이는 문항별 판정.
  resultLabel({ correct, usedHint, timedOut }) {
    if (timedOut) return '시간 초과';
    if (!correct) return '오답';
    return usedHint ? '정답 (힌트 0.5점)' : '정답';
  },

  // 남은 시간(초)은 반복 횟수가 아니라 시작 시각과의 차이로 계산한다. 0~15로 자른다.
  remainingSeconds(startMs, nowMs) {
    const sec = Math.ceil((QuizCore.SPEED_LIMIT_MS - (nowMs - startMs)) / 1000);
    return Math.min(15, Math.max(0, sec));
  },

  isTimedOut(startMs, nowMs) {
    return nowMs - startMs >= QuizCore.SPEED_LIMIT_MS;
  },

  // 순위표는 모드(스피드, 힌트) × 카테고리마다 하나씩, 모두 8개다. 표마다 상위 5건을 남긴다.
  BOARD_MODES: ['speed', 'hint'],
  BOARD_SIZE: 5,

  // 표 하나를 가리키는 키. 예: 'speed:science'
  boardKey(mode, categoryId) {
    return `${mode}:${categoryId}`;
  },

  // 표 8개의 키를 화면에 놓을 순서(스피드 4개 → 힌트 4개)로 돌려준다.
  boardKeys(categories) {
    return QuizCore.BOARD_MODES.flatMap(mode => categories.map(c => QuizCore.boardKey(mode, c.id)));
  },

  // 앞뒤 공백을 뺀 이름. 1~10자가 아니거나 문자열이 아니면 null.
  normalizeName(text) {
    if (typeof text !== 'string') return null;
    const name = text.trim();
    return name.length >= 1 && name.length <= 10 ? name : null;
  },

  // 저장된 순위표 문자열을 읽는다. 깨진 값은 빈 표로, 모르는 키·배열이 아닌 값·형식이 틀린 기록은 그것만 버린다.
  parseBoard(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return {};
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return {};

    const isRecord = r => r !== null && typeof r === 'object'
      && QuizCore.normalizeName(r.name) !== null
      && Number.isInteger(r.halfPoints) && r.halfPoints >= 0 && r.halfPoints <= 20
      && typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date));

    const board = {};
    for (const key of QuizCore.boardKeys(CATEGORIES)) {
      if (!Array.isArray(data[key])) continue;
      const records = data[key].filter(isRecord).slice(0, QuizCore.BOARD_SIZE)
        .map(r => ({ name: QuizCore.normalizeName(r.name), halfPoints: r.halfPoints, date: r.date }));
      if (records.length > 0) board[key] = records;
    }
    return board;
  },

  // 새 기록을 같은 점수의 기존 기록들 바로 아래에 끼워 넣는다. 5위 밖이면 rank는 null이고 표는 그대로다.
  addRecord(board, key, { name, halfPoints, date }) {
    const list = board[key] || [];
    let pos = list.findIndex(r => r.halfPoints < halfPoints);
    if (pos === -1) pos = list.length;
    if (pos >= QuizCore.BOARD_SIZE) return { board: { ...board }, rank: null };
    const next = list.slice();
    next.splice(pos, 0, { name, halfPoints, date });
    return { board: { ...board, [key]: next.slice(0, QuizCore.BOARD_SIZE) }, rank: pos + 1 };
  },

  // ISO 문자열을 로컬 날짜 'YYYY-MM-DD'로 바꾼다.
  formatDate(isoString) {
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  // 문항 데이터 검사(PRD 5.2, 7.1). 오류 메시지 배열을 돌려주고, 문제가 없으면 빈 배열이다.
  // 잘못된 모양의 항목이 있어도 던지지 않고 메시지로 알린다.
  validateQuestions(questions, categories) {
    const errors = [];
    const SUPERLATIVES = ['가장', '최대', '최소', '최고', '최저', '최장', '최단', '최초', '제일'];
    const isText = v => typeof v === 'string' && v.trim() !== '';

    if (!Array.isArray(categories)) {
      return ['전체: categories가 배열이 아님'];
    }
    if (!Array.isArray(questions)) {
      return ['전체: questions가 배열이 아님'];
    }
    if (categories.length !== 4) errors.push(`전체: 카테고리 ${categories.length}개 (4개여야 함)`);

    const catById = new Map();
    for (const c of categories) {
      if (c && typeof c.id === 'string') catById.set(c.id, c);
    }

    // 카테고리마다 정확히 10문항
    for (const c of categories) {
      if (!c) continue;
      const n = questions.filter(q => q && q.category === c.id).length;
      if (n !== 10) errors.push(`${c.id}: 문항 ${n}개`);
    }

    const seenIds = new Set();
    questions.forEach((q, index) => {
      if (q === null || typeof q !== 'object') {
        errors.push(`문항 #${index + 1}: 객체가 아님`);
        return;
      }
      const label = isText(q.id) ? q.id : `문항 #${index + 1}`;
      const err = msg => errors.push(`${label}: ${msg}`);

      // id
      if (!isText(q.id)) {
        err('id가 없음');
      } else if (seenIds.has(q.id)) {
        err('id가 겹침');
      } else {
        seenIds.add(q.id);
      }

      // category, id 접두어
      const cat = catById.get(q.category);
      if (!cat) {
        err(`카테고리 "${q.category}"가 목록에 없음`);
      } else if (isText(q.id)) {
        const head = `${cat.prefix}-`;
        if (!(q.id.startsWith(head) && /^\d{2}$/.test(q.id.slice(head.length)))) {
          err(`id가 "${head}NN" 형식이 아님`);
        }
      }

      // 문제
      if (!isText(q.question)) {
        err('문제가 비어 있음');
      } else if (SUPERLATIVES.some(w => q.question.includes(w)) && !q.question.includes('기준')) {
        err('최상급 표현이 있는데 "기준"이 없음');
      }

      // 보기
      if (!Array.isArray(q.choices) || q.choices.length !== 4) {
        err('보기가 4개가 아님');
      } else if (!q.choices.every(isText)) {
        err('비어 있는 보기가 있음');
      } else if (new Set(q.choices.map(s => s.trim())).size !== 4) {
        err('겹치는 보기가 있음');
      }

      // 정답 위치
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
        err('answer가 0~3 정수가 아님');
      }

      // 해설
      if (!isText(q.explanation)) {
        err('해설이 비어 있음');
      } else if (q.explanation.length > 80) {
        err('해설이 80자를 넘음');
      }

      // 출처
      const s = q.source;
      if (s === null || typeof s !== 'object') {
        err('출처(source)가 없음');
      } else {
        if (!isText(s.title)) err('source.title이 없음');
        if (!isText(s.url)) err('source.url이 없음');
        else if (!s.url.startsWith('https://')) err('source.url이 https://로 시작하지 않음');
        if (!isText(s.checkedAt)) err('source.checkedAt이 없음');
        else if (!/^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt)) err('source.checkedAt이 YYYY-MM-DD 형식이 아님');
      }
    });

    return errors;
  },
};

// ===================================================================
// 저장소: localStorage 읽기·쓰기. getStorage() 호출부터 try 안에서 하므로 막힌 브라우저에서도 던지지 않는다.
// ===================================================================

function createQuizStore(getStorage) {
  const BOARD_KEY = 'quiz.leaderboard.v1';
  const NAME_KEY = 'quiz.playerName.v1';
  return {
    // ok가 false면 저장소를 쓸 수 없는 브라우저다. 깨진 값은 빈 표로 읽고 ok는 true다.
    loadBoard() {
      try {
        return { board: QuizCore.parseBoard(getStorage().getItem(BOARD_KEY)), ok: true };
      } catch (e) {
        return { board: {}, ok: false };
      }
    },
    saveBoard(board) {
      try {
        getStorage().setItem(BOARD_KEY, JSON.stringify(board));
        return true;
      } catch (e) {
        return false;
      }
    },
    loadPlayerName() {
      try {
        const name = getStorage().getItem(NAME_KEY);
        return typeof name === 'string' ? name : '';
      } catch (e) {
        return '';
      }
    },
    savePlayerName(name) {
      try {
        getStorage().setItem(NAME_KEY, name);
        return true;
      } catch (e) {
        return false;
      }
    },
  };
}

// ===================================================================
// 화면 처리 (DOM 사용). #app이 있을 때만 시작한다.
// ===================================================================

const MODES = {
  practice: { name: '연습', rule: '시간 제한과 힌트 없음, 맞히면 1점' },
  speed: { name: '스피드', rule: '문항마다 15초, 시간이 지나면 오답' },
  hint: { name: '힌트', rule: '문항마다 힌트 1번(오답 2개 제거), 힌트를 쓰고 맞히면 0.5점' },
};

const store = createQuizStore(() => window.localStorage);

let selectedCategory = null;
let game = null;
let timerId = null;
let board = {};
// 마지막으로 저장한 이름. 결과 화면의 이름 입력칸을 미리 채운다.
let lastPlayerName = '';

function el(id) {
  return document.getElementById(id);
}

// name: 'mode' | 'start' | 'question' | 'result' | 'board'
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => {
    s.hidden = s.id !== 'screen-' + name;
  });
  const screen = document.getElementById('screen-' + name);
  if (!screen) return;
  const title = screen.querySelector('[tabindex="-1"]');
  if (title) title.focus();
}

// 처음 화면은 시작(카테고리 선택) 화면이다.
function goHome() {
  game = null;
  showScreen('start');
}

// 고른 카테고리 이름을 제목에 넣고, 모드마다 규칙 한 줄을 붙인다.
function renderModes() {
  const category = CATEGORIES.find((c) => c.id === selectedCategory);
  el('mode-title').textContent = `${category ? category.name : ''} · 모드를 고르세요`;

  const list = el('mode-list');
  list.textContent = '';
  Object.keys(MODES).forEach((mode) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.mode = mode;
    const name = document.createElement('strong');
    name.className = 'mode-name';
    name.textContent = MODES[mode].name;
    const rule = document.createElement('span');
    rule.className = 'mode-rule';
    rule.textContent = MODES[mode].rule;
    btn.append(name, rule);
    if (mode === 'practice') {
      const norecord = document.createElement('span');
      norecord.className = 'mode-rule';
      norecord.textContent = '순위표에 기록되지 않음';
      btn.appendChild(norecord);
    }
    list.appendChild(btn);
  });
}

function renderStart() {
  const list = el('category-list');
  list.textContent = '';
  CATEGORIES.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.category = c.id;
    btn.textContent = c.name;
    list.appendChild(btn);
  });
}

// ---- 문제 화면 ----

// keptScore: 다시 풀기 판에서 그대로 보여 줄 처음 판의 점수 { halfPoints, count }. 일반 판은 null.
function startGame({ mode, categoryId, questionList, isRetry, keptScore = null }) {
  stopTimer();
  game = {
    mode,
    categoryId,
    isRetry,
    keptScore,
    saved: false, // 결과 화면에서 기록을 저장했는지. [기록 저장]을 두 번 눌러도 한 번만 저장한다.
    items: QuizCore.prepareItems(questionList, Math.random),
    index: 0,
    phase: 'answering',
    usedHint: false,
    startMs: 0,
    results: [],
  };
  showScreen('question');
  renderQuestion();
}

function totalHalfPoints() {
  return game.results.reduce((sum, r) => sum + r.halfPoints, 0);
}

// 다시 풀기 판은 점수를 매기지 않고 처음 판의 점수를 그대로 보여 준다.
function currentScoreText() {
  return QuizCore.formatScore(game.keptScore ? game.keptScore.halfPoints : totalHalfPoints());
}

function renderQuestion() {
  const item = game.items[game.index];
  const category = CATEGORIES.find((c) => c.id === game.categoryId);

  el('q-category').textContent = category ? category.name : '';
  el('q-progress').textContent = `${game.index + 1} / ${game.items.length}`;
  el('q-score').textContent = currentScoreText();
  el('q-text').textContent = item.question;

  const list = el('choice-list');
  list.textContent = '';
  item.choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.dataset.index = String(i);
    btn.textContent = text;
    list.appendChild(btn);
  });

  el('btn-hint').hidden = game.mode !== 'hint';
  el('btn-hint').disabled = false;
  el('btn-hint').textContent = '힌트 (오답 2개 지우기)';
  el('feedback').hidden = true;
  el('btn-next').hidden = true;
  el('q-text').focus();

  const timer = el('q-timer');
  timer.hidden = game.mode !== 'speed';
  timer.classList.remove('is-urgent');
  if (game.mode === 'speed') startTimer();
}

// ---- 스피드 모드 타이머 ----
// 타이머는 하나만 둔다. 새로 시작할 때는 언제나 기존 것을 먼저 정리한다.

function startTimer() {
  stopTimer();
  game.startMs = Date.now();
  renderTimer(game.startMs);
  timerId = setInterval(tick, 200);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function renderTimer(nowMs) {
  const sec = QuizCore.remainingSeconds(game.startMs, nowMs);
  const timer = el('q-timer');
  timer.textContent = `남은 시간 ${sec}초`;
  timer.classList.toggle('is-urgent', sec <= 5);
}

function tick() {
  if (!game || game.mode !== 'speed' || game.phase !== 'answering') {
    stopTimer();
    return;
  }
  const now = Date.now();
  renderTimer(now);
  if (QuizCore.isTimedOut(game.startMs, now)) {
    finishQuestion({ chosenIndex: null, timedOut: true });
  }
}

// ---- 힌트 모드 ----

// 오답 2개를 잠그고 흐리게 한다. 버튼 자리는 그대로 둔다.
function useHint() {
  if (!game || game.mode !== 'hint' || game.phase !== 'answering' || game.usedHint) return;
  const item = game.items[game.index];
  const removals = QuizCore.pickHintRemovals(item, Math.random);
  const choices = el('choice-list').querySelectorAll('.choice');
  removals.forEach((i) => {
    choices[i].disabled = true;
    choices[i].classList.add('is-removed');
  });
  game.usedHint = true;
  el('btn-hint').disabled = true;
  el('btn-hint').textContent = '힌트 사용함';
  // 잠긴 [힌트]에 초점이 남지 않게 남은 첫 보기로 옮긴다.
  const first = [...choices].find((b) => !b.disabled);
  if (first) first.focus();
}

function finishQuestion({ chosenIndex, timedOut }) {
  if (game.phase !== 'answering') return;
  stopTimer();
  el('btn-hint').disabled = true;
  const item = game.items[game.index];
  const correct = !timedOut && chosenIndex === item.answerIndex;
  const halfPoints = QuizCore.scoreAnswer({ correct, usedHint: game.usedHint });

  game.results.push({
    questionId: item.id,
    chosenIndex: timedOut ? null : chosenIndex,
    correct,
    usedHint: game.usedHint,
    timedOut: !!timedOut,
    halfPoints,
  });
  game.phase = 'feedback';

  el('choice-list').querySelectorAll('.choice').forEach((btn) => {
    const i = Number(btn.dataset.index);
    btn.disabled = true;
    if (i === item.answerIndex) {
      btn.classList.add('is-correct');
      btn.textContent = '✓ ' + item.choices[i];
    } else if (i === chosenIndex && !timedOut) {
      btn.classList.add('is-wrong');
      btn.textContent = '✗ ' + item.choices[i];
    }
  });

  el('q-score').textContent = currentScoreText();
  el('feedback-verdict').textContent = timedOut ? '시간 초과' : correct ? '정답입니다' : '오답입니다';
  el('feedback-explanation').textContent = item.explanation;

  const src = el('feedback-source');
  src.textContent = '';
  const link = document.createElement('a');
  link.href = item.source.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = item.source.title;
  src.appendChild(link);

  el('feedback').hidden = false;
  const isLast = game.index === game.items.length - 1;
  el('btn-next').textContent = isLast ? '결과 보기' : '다음';
  el('btn-next').hidden = false;
}

function nextQuestion() {
  if (game.phase !== 'feedback') return;
  if (game.index === game.items.length - 1) {
    showResult();
    return;
  }
  game.index++;
  game.usedHint = false;
  game.phase = 'answering';
  renderQuestion();
}

// ---- 결과 화면 ----

function showResult() {
  stopTimer();
  game.phase = 'done';
  const correctCount = game.results.filter((r) => r.correct).length;

  if (game.keptScore) {
    el('result-score').textContent = `${QuizCore.formatScore(game.keptScore.halfPoints)} / ${game.keptScore.count}`;
    el('result-correct').textContent = `다시 풀기에서 맞힌 문항: ${correctCount} / ${game.items.length}개`;
  } else {
    el('result-score').textContent = `${QuizCore.formatScore(totalHalfPoints())} / ${game.items.length}`;
    el('result-correct').textContent = `맞힌 문항: ${correctCount}개`;
  }
  renderResultList();
  const hintCount = game.results.filter((r) => r.usedHint).length;
  el('result-hints').textContent = `힌트를 쓴 문항: ${hintCount}개`;
  el('result-hints').hidden = game.mode !== 'hint';
  el('result-norecord').hidden = game.mode !== 'practice';
  // 다시 풀기는 연습 모드에서 틀린 문항이 있을 때만(스피드·힌트는 하지 않음).
  el('btn-retry').hidden = !(game.mode === 'practice' && QuizCore.wrongQuestionIds(game.results).length > 0);

  // 스피드·힌트 판(다시 풀기 판 제외)만 점수 아래에 이름 입력칸과 [기록 저장]을 보인다.
  el('save-form').hidden = !canSave();
  el('save-error').hidden = true;
  el('player-name').value = lastPlayerName;
  updateSaveButton();

  showScreen('result');
}

function canSave() {
  return !!game && game.phase === 'done' && game.mode !== 'practice' && !game.isRetry;
}

// 이름이 비었거나 공백뿐이면 [기록 저장]을 잠근다.
function updateSaveButton() {
  el('btn-save').disabled = !canSave() || game.saved || QuizCore.normalizeName(el('player-name').value) === null;
}

// 이번 판을 그 모드·카테고리 표에 넣고 저장한 뒤 순위표 화면으로 간다.
// 저장에 실패하면 "기록을 저장할 수 없음"을 보이고 결과 화면에 머문다.
function saveRecord() {
  if (!canSave() || game.saved) return;
  const name = QuizCore.normalizeName(el('player-name').value);
  if (name === null) return;
  const { board: next } = QuizCore.addRecord(board, QuizCore.boardKey(game.mode, game.categoryId), {
    name,
    halfPoints: totalHalfPoints(),
    date: new Date().toISOString(),
  });
  lastPlayerName = name;
  store.savePlayerName(name);
  if (!store.saveBoard(next)) {
    el('save-error').hidden = false;
    return;
  }
  board = next;
  game.saved = true;
  openBoard();
}

// 문항마다 "문제 — 판정" 한 줄. 문제 글은 textContent로 넣는다.
function renderResultList() {
  const list = el('result-list');
  list.textContent = '';
  game.results.forEach((r, i) => {
    const li = document.createElement('li');
    const label = QuizCore.resultLabel(r);
    li.className = r.correct ? 'is-correct' : 'is-wrong';
    li.textContent = `${game.items[i].question} — ${label}`;
    list.appendChild(li);
  });
}

// ---- 순위표 화면 ----

function openBoard() {
  renderBoard();
  showScreen('board');
}

// 표 8개(스피드 · 카테고리 4개, 힌트 · 카테고리 4개)를 차례로 그린다.
function renderBoard() {
  const list = el('board-list');
  list.textContent = '';
  QuizCore.BOARD_MODES.forEach((mode) => {
    CATEGORIES.forEach((c) => {
      const section = document.createElement('section');
      section.className = 'board-section';
      const title = document.createElement('h3');
      title.textContent = `${MODES[mode].name} · ${c.name}`;
      section.appendChild(title);

      const records = board[QuizCore.boardKey(mode, c.id)] || [];
      if (records.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'board-empty';
        empty.textContent = '기록 없음';
        section.appendChild(empty);
      } else {
        const table = document.createElement('table');
        table.className = 'board-table';
        const headRow = table.createTHead().insertRow();
        ['순위', '이름', '점수', '날짜'].forEach((text) => {
          const th = document.createElement('th');
          th.scope = 'col';
          th.textContent = text;
          headRow.appendChild(th);
        });
        const body = table.createTBody();
        records.forEach((r, i) => {
          const row = body.insertRow();
          // 이름은 사용자가 입력한 값이므로 모든 칸을 textContent로 넣는다.
          [String(i + 1), r.name, QuizCore.formatScore(r.halfPoints), QuizCore.formatDate(r.date)].forEach((text) => {
            row.insertCell().textContent = text;
          });
        });
        section.appendChild(table);
      }
      list.appendChild(section);
    });
  });
}

function quitGame() {
  stopTimer();
  game = null;
  goHome();
}

function init() {
  renderStart();
  el('category-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    selectedCategory = btn.dataset.category;
    renderModes();
    showScreen('mode');
  });
  el('btn-back').addEventListener('click', goHome);
  el('mode-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || !selectedCategory) return;
    startGame({
      mode: btn.dataset.mode,
      categoryId: selectedCategory,
      questionList: QuizCore.questionsByCategory(QUESTIONS, selectedCategory),
      isRetry: false,
    });
  });
  el('choice-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice');
    if (!btn || !game || game.phase !== 'answering') return;
    // 15초가 지났는데 아직 tick이 돌지 않은 사이의 클릭은 시간 초과로 본다.
    if (game.mode === 'speed' && QuizCore.isTimedOut(game.startMs, Date.now())) {
      tick();
      return;
    }
    finishQuestion({ chosenIndex: Number(btn.dataset.index), timedOut: false });
  });
  // 다른 탭에서는 setInterval이 느려지므로, 돌아오자마자 한 번 확인한다.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && timerId !== null) tick();
  });
  el('btn-next').addEventListener('click', () => {
    if (game) nextQuestion();
  });
  el('btn-hint').addEventListener('click', useHint);
  el('btn-quit').addEventListener('click', quitGame);
  el('btn-retry').addEventListener('click', () => {
    if (!game || game.phase !== 'done' || game.mode !== 'practice') return;
    const ids = QuizCore.wrongQuestionIds(game.results);
    if (ids.length === 0) return;
    // 다시 풀기를 거듭해도 처음 판의 점수를 넘겨준다.
    const keptScore = game.keptScore || { halfPoints: totalHalfPoints(), count: game.items.length };
    startGame({
      mode: 'practice',
      categoryId: game.categoryId,
      questionList: QUESTIONS.filter((q) => ids.includes(q.id)),
      isRetry: true,
      keptScore,
    });
  });
  // 다시 풀기 판에서 눌러도 10문항짜리 일반 판으로 시작한다.
  el('btn-again').addEventListener('click', () => {
    if (!game) return;
    startGame({
      mode: game.mode,
      categoryId: game.categoryId,
      questionList: QuizCore.questionsByCategory(QUESTIONS, game.categoryId),
      isRetry: false,
    });
  });
  el('btn-home').addEventListener('click', goHome);
  el('player-name').addEventListener('input', updateSaveButton);
  el('save-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveRecord();
  });
  el('btn-board-open').addEventListener('click', openBoard);
  el('btn-board-home').addEventListener('click', goHome);

  // 저장소가 막혔거나 값이 깨졌으면 빈 표로 시작한다.
  board = store.loadBoard().board;
  lastPlayerName = store.loadPlayerName();
  goHome();
}

if (document.getElementById('app')) init();
