const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, msg: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert 실패'); }
function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} 기대 ${b}, 실제 ${a}`);
}
function makeRng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function makeQuestion(id, category, overrides = {}) {
  return { id, category, question: `${id} 문제`, choices: [`${id}-A`, `${id}-B`, `${id}-C`, `${id}-D`], answer: 0,
    explanation: '해설', source: { title: '출처', url: 'https://example.org', checkedAt: '2026-10-08' }, ...overrides };
}

// ===== 1단계: 섞기 =====
test('shuffle: 원소 보존, 입력 불변', () => {
  const input = [1, 2, 3, 4, 5];
  const out = QuizCore.shuffle(input, makeRng(1));
  assertEqual(input, [1, 2, 3, 4, 5]);
  assertEqual([...out].sort(), [1, 2, 3, 4, 5]);
});
test('shuffle: 피셔-예이츠 순서', () => {
  assertEqual(QuizCore.shuffle([1, 2, 3, 4], () => 0), [2, 3, 4, 1]);
  assertEqual(QuizCore.shuffle([1, 2, 3, 4], () => 0.999), [1, 2, 3, 4]);
});
test('questionsByCategory: 해당 카테고리만', () => {
  const qs = [makeQuestion('kh-01', 'korean-history'), makeQuestion('sc-01', 'science'), makeQuestion('kh-02', 'korean-history')];
  assertEqual(QuizCore.questionsByCategory(qs, 'korean-history').map(q => q.id), ['kh-01', 'kh-02']);
});
test('prepareItems: 섞은 뒤에도 정답 유지, 입력 불변', () => {
  const list = [0, 1, 2, 3].map(a => makeQuestion(`kh-0${a + 1}`, 'korean-history', { answer: a }));
  const before = JSON.stringify(list);
  for (let seed = 1; seed <= 20; seed++) {
    const items = QuizCore.prepareItems(list, makeRng(seed));
    assertEqual(items.map(i => i.id).sort(), ['kh-01', 'kh-02', 'kh-03', 'kh-04']);
    for (const item of items) {
      const orig = list.find(q => q.id === item.id);
      assertEqual(item.choices[item.answerIndex], orig.choices[orig.answer], item.id);
      assertEqual(Object.keys(item).sort(), ['answerIndex', 'choices', 'explanation', 'id', 'question', 'source']);
    }
  }
  assertEqual(JSON.stringify(list), before);
});

// ===== 2단계: 점수 =====
test('scoreAnswer: 2/1/0', () => {
  assertEqual(QuizCore.scoreAnswer({ correct: true, usedHint: false }), 2);
  assertEqual(QuizCore.scoreAnswer({ correct: true, usedHint: true }), 1);
  assertEqual(QuizCore.scoreAnswer({ correct: false, usedHint: false }), 0);
  assertEqual(QuizCore.scoreAnswer({ correct: false, usedHint: true }), 0);
});
test('formatScore', () => {
  assertEqual([14, 15, 0, 1].map(QuizCore.formatScore), ['7', '7.5', '0', '0.5']);
});

// ===== 문항 데이터 검사 =====
function makeValidSet() {
  return CATEGORIES.flatMap(c => Array.from({ length: 10 }, (_, i) =>
    makeQuestion(`${c.prefix}-${String(i + 1).padStart(2, '0')}`, c.id)));
}
test('validateQuestions: 올바른 40문항은 오류 없음', () => {
  assertEqual(QuizCore.validateQuestions(makeValidSet(), CATEGORIES), []);
  const qs = makeValidSet();
  qs[0].question = '길이 기준으로 세계에서 가장 긴 강은?';
  qs[1].explanation = '가'.repeat(80);
  assertEqual(QuizCore.validateQuestions(qs, CATEGORIES), []);
});
test('validateQuestions: 카테고리가 4개가 아니면 오류', () => {
  assert(QuizCore.validateQuestions(makeValidSet(), CATEGORIES.slice(0, 3)).length > 0);
});
const BROKEN = [
  ['카테고리 문항 9개', qs => qs.splice(0, 1)],
  ['카테고리 문항 11개', qs => qs.push(makeQuestion('kh-11', 'korean-history'))],
  ['id 중복', qs => { qs[1].id = qs[0].id; }],
  ['접두어 불일치', qs => { qs[0].id = 'wg-99'; }],
  ['없는 카테고리', qs => { qs[0].category = 'music'; }],
  ['보기 3개', qs => { qs[0].choices = qs[0].choices.slice(0, 3); }],
  ['빈 보기', qs => { qs[0].choices[1] = ' '; }],
  ['겹치는 보기', qs => { qs[0].choices[1] = qs[0].choices[0]; }],
  ['answer 4', qs => { qs[0].answer = 4; }],
  ['answer 1.5', qs => { qs[0].answer = 1.5; }],
  ['빈 해설', qs => { qs[0].explanation = ''; }],
  ['81자 해설', qs => { qs[0].explanation = '가'.repeat(81); }],
  ['출처 제목 없음', qs => { delete qs[0].source.title; }],
  ['http 주소', qs => { qs[0].source = { ...qs[0].source, url: 'http://example.org' }; }],
  ['checkedAt 형식', qs => { qs[0].source = { ...qs[0].source, checkedAt: '2026/10/08' }; }],
  ['최상급인데 기준 없음', qs => { qs[0].question = '세계에서 가장 긴 강은?'; }],
  ['보기가 배열이 아님', qs => { qs[0].choices = 'abcd'; }],
  ['source 없음', qs => { delete qs[0].source; }],
  ['문항이 null', qs => { qs[0] = null; }],
];
for (const [label, mutate] of BROKEN) {
  test(`validateQuestions: ${label} → 오류`, () => {
    const qs = makeValidSet(); mutate(qs);
    assert(QuizCore.validateQuestions(qs, CATEGORIES).length > 0, label);
  });
}
test('validateQuestions: 메시지 형식과 입력 불변', () => {
  const qs = makeValidSet();
  qs[0].explanation = '가'.repeat(81);
  qs.splice(10, 1);
  const before = JSON.stringify(qs);
  const errors = QuizCore.validateQuestions(qs, CATEGORIES);
  assert(errors.some(m => m.startsWith('kh-01: ')), errors.join(' | '));
  assert(errors.includes('world-geography: 문항 9개'), errors.join(' | '));
  assert(QuizCore.validateQuestions(makeValidSet(), CATEGORIES.slice(0, 3)).some(m => m.startsWith('전체: ')));
  assertEqual(JSON.stringify(qs), before);
});

test('문항 데이터: 40문항이 작성 규칙을 지킨다', () => {
  const errors = QuizCore.validateQuestions(QUESTIONS, CATEGORIES);
  assert(errors.length === 0, errors.join(' / '));
});

// ===== 2단계: 힌트·다시 풀기·타이머 =====
test('pickHintRemovals: 정답 제외, 서로 다른 2개', () => {
  for (let answerIndex = 0; answerIndex < 4; answerIndex++) {
    for (let seed = 1; seed <= 30; seed++) {
      const r = QuizCore.pickHintRemovals({ answerIndex, choices: ['a', 'b', 'c', 'd'] }, makeRng(seed));
      assert(r.length === 2 && r[0] !== r[1], JSON.stringify(r));
      assert(!r.includes(answerIndex) && r.every(i => i >= 0 && i <= 3), JSON.stringify(r));
    }
  }
});
test('wrongQuestionIds: 틀린 문항만 순서대로', () => {
  const rs = [{ questionId: 'a', correct: false }, { questionId: 'b', correct: true },
              { questionId: 'c', correct: false, timedOut: true }];
  assertEqual(QuizCore.wrongQuestionIds(rs), ['a', 'c']);
  assertEqual(QuizCore.wrongQuestionIds([{ questionId: 'b', correct: true }]), []);
});
test('remainingSeconds / isTimedOut 경계값', () => {
  const s = 1000;
  assertEqual([0, 1, 1000, 14001, 15000, 20000].map(e => QuizCore.remainingSeconds(s, s + e)), [15, 15, 14, 1, 0, 0]);
  assertEqual(QuizCore.isTimedOut(s, s + 14999), false);
  assertEqual(QuizCore.isTimedOut(s, s + 15000), true);
});
test('resultLabel: 시간 초과 / 힌트 정답 / 정답 / 오답', () => {
  assertEqual(QuizCore.resultLabel({ correct: false, usedHint: false, timedOut: true }), '시간 초과');
  assertEqual(QuizCore.resultLabel({ correct: true, usedHint: true, timedOut: false }), '정답 (힌트 0.5점)');
  assertEqual(QuizCore.resultLabel({ correct: true, usedHint: false, timedOut: false }), '정답');
  assertEqual(QuizCore.resultLabel({ correct: false, usedHint: true, timedOut: false }), '오답');
});

// ===== 3단계: 이름과 저장값 검사 =====
test('normalizeName', () => {
  assertEqual(QuizCore.normalizeName('  민지 '), '민지');
  assertEqual(['', '   ', '가'.repeat(11), null].map(QuizCore.normalizeName), [null, null, null, null]);
  assertEqual(QuizCore.normalizeName('가'.repeat(10)), '가'.repeat(10));
});
test('boardKey와 표 8개', () => {
  assertEqual(QuizCore.boardKey('speed', 'science'), 'speed:science');
  assertEqual(QuizCore.boardKeys(CATEGORIES).length, 8);
  assertEqual(QuizCore.boardKeys(CATEGORIES).slice(0, 2), ['speed:korean-history', 'speed:world-geography']);
  assertEqual(QuizCore.boardKeys(CATEGORIES)[4], 'hint:korean-history');
});
const OK = { name: '민지', halfPoints: 18, date: '2026-10-08T05:03:00.000Z' };
test('parseBoard: 깨진 값은 빈 표', () => {
  for (const t of ['{broken', '{깨짐', null, 'null', '[]', '"x"', '3']) assertEqual(QuizCore.parseBoard(t), {}, String(t));
});
test('parseBoard: 형식이 맞는 항목만 살린다', () => {
  const text = JSON.stringify({ 'speed:science': [OK, { ...OK, name: undefined }, { ...OK, name: '가'.repeat(11) }, { ...OK, name: '' },
    { ...OK, halfPoints: 1.5 }, { ...OK, halfPoints: 21 }, { ...OK, date: 'x' }, null] });
  assertEqual(QuizCore.parseBoard(text), { 'speed:science': [OK] });
});
test('parseBoard: 모르는 키와 배열 아닌 값은 그 키만 버린다', () => {
  const text = JSON.stringify({ 'hint:science': [OK], speed: [OK], 'practice:science': [OK], 'speed:music': [OK], 'science:speed': [OK], 'speed:korean-history': 'x' });
  assertEqual(QuizCore.parseBoard(text), { 'hint:science': [OK] });
});
test('parseBoard: 표마다 앞의 5개까지만', () => {
  const text = JSON.stringify({ 'speed:science': Array.from({ length: 7 }, () => OK) });
  assertEqual(QuizCore.parseBoard(text)['speed:science'].length, 5);
});

// ===== 3단계: 기록 추가와 날짜 =====
const rec = (name, halfPoints) => ({ name, halfPoints, date: '2026-10-08T05:03:00.000Z' });
const fullSpeed = () => ({ 'speed:science': [20, 18, 16, 14, 12].map((p, i) => rec(`P${i}`, p)) });
test('addRecord: 빈 표에 이름과 함께 1위', () => {
  const r = QuizCore.addRecord({}, 'speed:korean-history', rec('민지', 18));
  assertEqual(r, { board: { 'speed:korean-history': [rec('민지', 18)] }, rank: 1 });
});
test('addRecord: 동점이면 먼저 저장한 기록이 위', () => {
  const r = QuizCore.addRecord({ 'speed:science': [rec('A', 18)] }, 'speed:science', rec('B', 18));
  assertEqual(r.board['speed:science'].map(x => x.name), ['A', 'B']); assertEqual(r.rank, 2);
});
test('addRecord: 6건째를 넣으면 상위 5건만 남고 다른 표와 입력은 그대로', () => {
  const full = { ...fullSpeed(), 'hint:science': [rec('H', 2)], 'speed:arts-culture': [rec('S', 4)] };
  const before = JSON.stringify(full);
  const r = QuizCore.addRecord(full, 'speed:science', rec('N', 15));
  assertEqual(r.rank, 4);
  assertEqual(r.board['speed:science'].map(x => x.halfPoints), [20, 18, 16, 15, 14]);
  assertEqual(r.board['hint:science'], [rec('H', 2)]); assertEqual(r.board['speed:arts-culture'], [rec('S', 4)]);
  assertEqual(JSON.stringify(full), before);
});
test('addRecord: 꽉 찬 표에서 5위와 동점이거나 낮으면 들어가지 않는다', () => {
  const full = fullSpeed();
  for (const p of [12, 0]) {
    const r = QuizCore.addRecord(full, 'speed:science', rec('N', p));
    assertEqual(r.rank, null); assertEqual(r.board, full);
  }
});
test('formatDate: 로컬 날짜', () => {
  assertEqual(QuizCore.formatDate(new Date(2026, 8, 26, 23, 59).toISOString()), '2026-09-26');
  assertEqual(QuizCore.formatDate(new Date(2026, 9, 8, 0, 1).toISOString()), '2026-10-08');
});

// ===== 3단계: 저장소 =====
function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
test('store: 저장하고 다시 읽는다', () => {
  const mem = memoryStorage();
  const s = createQuizStore(() => mem);
  const b = { 'speed:science': [OK] };
  assert(s.saveBoard(b)); assertEqual(s.loadBoard(), { board: b, ok: true });
  assert(s.savePlayerName('민지')); assertEqual(s.loadPlayerName(), '민지');
});
test('store: localStorage가 막혀도 예외 없이 실패를 알린다', () => {
  const s = createQuizStore(() => { throw new Error('SecurityError'); });
  assertEqual(s.loadBoard(), { board: {}, ok: false });
  assertEqual([s.saveBoard({}), s.savePlayerName('a')], [false, false]);
  assertEqual(s.loadPlayerName(), '');
});
test('store: 깨진 값은 빈 표, 저장은 가능', () => {
  const s = createQuizStore(() => memoryStorage({ 'quiz.leaderboard.v1': '{broken' }));
  assertEqual(s.loadBoard(), { board: {}, ok: true });
});
test('store: 쓰기만 실패하면 false', () => {
  const s = createQuizStore(() => ({ ...memoryStorage(), setItem() { throw new Error('QuotaExceeded'); } }));
  assertEqual(s.saveBoard({}), false);
});

// ===== 결과 표시 =====
window.addEventListener('load', () => {
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  document.getElementById('summary').textContent = `통과 ${passed} · 실패 ${failed}`;
  const list = document.getElementById('results');
  for (const r of results) {
    const li = document.createElement('li');
    li.textContent = r.ok ? `통과: ${r.name}` : `실패: ${r.name} — ${r.msg}`;
    if (!r.ok) { li.className = 'fail'; li.style.color = '#c00'; }
    list.appendChild(li);
  }
});
