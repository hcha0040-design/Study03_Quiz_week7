# 상식 퀴즈 웹 앱 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 `index.html`을 더블클릭하면 동작하는 4지선다 상식 퀴즈(4개 카테고리 × 10문제)를 연습 → 스피드·힌트·다시 풀기 → 순위표 순서로 3단계에 걸쳐 만든다.

**Architecture:** 서버 없이 일반 `<script>` 태그 두 개(`questions.js` → `script.js`)를 전역 객체로 연결한다. `script.js` 앞부분의 `QuizCore`는 DOM·localStorage를 건드리지 않는 순수 함수 모음이고 `tests/test.html`이 이 함수들을 검사한다. 뒷부분의 화면 처리 코드는 `#app`이 있는 페이지에서만 실행된다.

**Tech Stack:** HTML, CSS, 바닐라 JavaScript(ES2020). 외부 라이브러리 없음. 테스트도 직접 만든 작은 assert 함수로 한다.

**Spec:** `PRD.md` (2026-10-10 수정본. 이 계획은 PRD의 장 번호를 그대로 인용한다. 구현하는 사람은 두 문서를 함께 읽는다.)

## Global Constraints

- 앱은 `index.html`, `style.css`, `script.js`, `questions.js` 4개 파일만으로 동작한다. `tests/`는 앱에 포함되지 않는다.
- `index.html`을 더블클릭한 `file://` 환경에서 콘솔 오류 없이 동작한다. 대상은 Windows의 최신 Chrome과 Edge다.
- `fetch`와 ES 모듈(`import`/`export`)을 쓰지 않는다. 스크립트 순서는 `questions.js` → `script.js`다.
- 외부 라이브러리를 쓰지 않는다(앱, 테스트 모두).
- `QuizCore` 함수는 DOM과 localStorage에 손대지 않고, 입력을 바꾸지 않으며, 무작위가 필요하면 `rng`(`() => 0 이상 1 미만`)를 인자로 받는다.
- 화면 처리 코드는 `document.getElementById('app')`이 있을 때만 시작한다.
- 점수는 내부에서 반점 단위 정수 `halfPoints`로 세고, 화면에 보일 때만 `formatScore`로 바꾼다.
- 사용자가 입력한 값(이름)은 언제나 `textContent`로 넣는다. `innerHTML`에 넣지 않는다.
- 보기와 모든 버튼은 `<button>`이다. 화면이 바뀌면 새 화면 제목(`tabindex="-1"`)으로 초점을 옮긴다. 정답/오답 안내 영역은 `aria-live="polite"`다. 정답/오답은 색과 글자(✓/✗)를 함께 쓴다.
- 폭 360px에서 가로 스크롤이 생기지 않는다.
- 출처 링크는 `target="_blank" rel="noopener"`다.
- localStorage 키는 `quiz.leaderboard.v1`, `quiz.playerName.v1`이고, 읽기·쓰기 모두 `try/catch` 안에서 한다.
- 화면 문구는 PRD 그대로 쓴다: "순위표에 기록되지 않음", "정답입니다", "오답입니다", "시간 초과", "순위표 보기", "이름 (1~10자)", "기록 저장", "기록 없음", "기록을 저장할 수 없음", 모드 규칙 세 줄(PRD 3.2).
- 순위표는 모드 × 카테고리 표 8개(스피드·힌트 × 카테고리 4개), 표마다 상위 5건이다. 저장 형식은 `{ 'speed:science': Record[], ... }`(키는 `모드:카테고리 id`), `Record = { name, halfPoints, date }`다(PRD 5.3).
- 하지 않는 것(PRD 10장): 서버·로그인, 효과음·애니메이션, 시간 보너스, 스피드·힌트 모드의 다시 풀기, [기록 지우기].

## Review Focus

PRD가 직접 말하지는 않지만 실제로 쓰다 보면 부딪히기 쉬운 입력과 상황이다. 각 항목을 맡은 작업에 검사를 넣어 두었다.

1. **보기, [다음], [결과 보기], [기록 저장]을 빠르게 두 번 누르는 경우** → 한 문항에 결과가 하나만 남고, 문제를 건너뛰지 않으며, 기록도 한 번만 저장되어야 한다. (작업 6, 작업 16)
2. **15초가 끝나는 순간에 보기를 누르거나, 다른 탭에 갔다가 돌아오는 경우** → 결과는 하나만 남고, 돌아오자마자 "시간 초과"가 떠야 한다. (작업 10)
3. **다시 풀기 판에서 틀린 문항이 1개뿐이거나, 다시 풀기 판에서 [같은 모드 다시]를 누르는 경우** → 진행은 `1 / 1`이고, 점수는 처음 판의 점수 그대로여야 한다. 다시 하기는 10문항짜리 일반 판으로 시작해야 한다. (작업 12)
4. **5건이 꽉 찬 표에서 5위와 같은 점수를 내는 경우** → 표에 넣지 않고 표는 그대로 둔다(동점이면 먼저 저장한 기록이 위). (작업 14)
5. **저장된 순위표에 모르는 키, 배열이 아닌 값, 카테고리가 잘못된 기록이 섞여 있는 경우** → 그 키나 기록만 버리고 나머지는 살려야 한다. (작업 13)

## 파일 구조

| 파일 | 맡는 일 | 처음 만드는 작업 |
|---|---|---|
| `questions.js` | `CATEGORIES`, `QUESTIONS` (데이터만) | 작업 1(카테고리), 작업 4(문항) |
| `script.js` | 앞부분 `QuizCore`(순수 함수) + `createQuizStore` / 뒷부분 화면 처리 | 작업 1 |
| `index.html` | 화면 영역 마크업, 스크립트 로드 | 작업 5 |
| `style.css` | 스타일, 좁은 화면 대응 | 작업 5 |
| `tests/test.html` | 자동 검사 페이지 | 작업 1 |
| `tests/tests.js` | 검사 하네스와 검사 코드 | 작업 1 |

**자동 검사 실행 방법**(모든 작업 공통): 브라우저로 `tests/test.html`을 연다(PowerShell: `Start-Process tests\test.html`, 에이전트는 내장 브라우저로 `file:///C:/study03_Quiz/tests/test.html`). 맨 위 요약 줄이 `통과 N · 실패 0`이면 통과다. 실패한 검사는 목록에 이유와 함께 빨간색으로 나온다.

**상태 객체 확장**: PRD 4.5의 상태에 두 가지를 더한다. `phase`에 `'done'`(결과 화면으로 넘어간 뒤 — 두 번 눌러도 기록이 한 번만 저장되게 하려고), 그리고 `saved`(3단계, 결과 화면에서 [기록 저장]을 이미 눌렀는지)다.

---

# 1단계: 연습 모드와 점수

## 만들 것

- 검사 하네스(`tests/test.html`, `tests/tests.js`)
- 1단계 `QuizCore`: `shuffle`, `questionsByCategory`, `prepareItems`, `scoreAnswer`, `formatScore`, `validateQuestions`
- 출처를 확인한 문항 40개(`questions.js`)
- 시작 화면(카테고리 4개, 연습 규칙, "순위표에 기록되지 않음")
- 문제 화면(즉시 채점, ✓/✗ 표시, 해설, 출처 링크, [그만두기], [다음]/[결과 보기])
- 결과 화면(점수, 맞힌 수, "순위표에 기록되지 않음", [같은 모드 다시], [처음으로])

## 완료 기준

- [ ] `tests/test.html`에서 문항 데이터 검사와 1단계 로직 검사가 모두 통과한다(`실패 0`).
- [ ] 아래 "1단계 브라우저 확인 항목"을 모두 확인했다.
- [ ] 40문항 모두 출처를 열어 정답과 오답 보기를 대조해 사람이 검수했다(작업 4의 검수표).

### Task 1: 검사 하네스와 섞기 함수

**Files:**
- Create: `tests/test.html`, `tests/tests.js`, `questions.js`, `script.js`

**Interfaces:**
- Produces:
  - `tests/tests.js`: `test(name, fn)`, `assert(cond, msg)`, `assertEqual(actual, expected, msg)`(JSON 비교), `makeRng(seed) -> () => number`, `makeQuestion(id, category, overrides?) -> 문항 객체`
  - `questions.js`: `const CATEGORIES`(PRD 5.1 그대로 4개), `const QUESTIONS = []`
  - `script.js`: `const QuizCore = { shuffle(arr, rng) -> 새 배열, questionsByCategory(questions, categoryId) -> 문항[], prepareItems(questionList, rng) -> { id, question, choices, answerIndex, explanation, source }[] }`

- [ ] **Step 1: 저장소와 하네스를 만든다**

`git init`을 한다. `tests/test.html`은 `<h1>자동 검사</h1><p id="summary"></p><ol id="results"></ol>` 아래에 `../questions.js`, `../script.js`, `tests.js`를 차례로 불러온다. `tests/tests.js`의 앞부분:

```js
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
window.addEventListener('load', () => { /* #summary에 "통과 N · 실패 M", #results에 이름·이유(실패는 빨간색) */ });
```

`questions.js`에는 PRD 5.1의 `CATEGORIES`와 빈 `QUESTIONS`를 쓰고, `script.js`에는 빈 `const QuizCore = {};`를 둔다.

- [ ] **Step 2: 실패하는 검사를 쓴다**

```js
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
```

- [ ] **Step 3: 검사가 실패하는지 확인한다**

`tests/test.html`을 연다. 기대: 4개 모두 실패(`QuizCore.shuffle is not a function` 등).

- [ ] **Step 4: `QuizCore.shuffle`, `questionsByCategory`, `prepareItems`를 구현한다**

`shuffle`: 사본을 만들고 `i = n-1`부터 `1`까지 `j = Math.floor(rng() * (i + 1))`로 바꾼다(위 고정 순서 검사가 이 방향을 정한다). `prepareItems`: 문항 순서를 `shuffle`하고, 문항마다 `[0,1,2,3]`을 `shuffle`한 순서로 `choices`를 다시 만들어, 원래 `answer`가 옮겨 간 위치를 `answerIndex`로 둔다.

- [ ] **Step 5: 검사가 통과하는지 확인한다** — 기대: `통과 4 · 실패 0`

- [ ] **Step 6: 커밋한다**

```bash
git add tests questions.js script.js
git commit -m "feat: 검사 하네스와 섞기 함수"
```

### Task 2: 점수 함수

**Files:**
- Modify: `script.js`(QuizCore), `tests/tests.js`

**Interfaces:**
- Produces: `QuizCore.scoreAnswer({ correct, usedHint }) -> 0 | 1 | 2`, `QuizCore.formatScore(halfPoints) -> string`

- [ ] **Step 1: 실패하는 검사를 쓴다**

```js
test('scoreAnswer: 2/1/0', () => {
  assertEqual(QuizCore.scoreAnswer({ correct: true, usedHint: false }), 2);
  assertEqual(QuizCore.scoreAnswer({ correct: true, usedHint: true }), 1);
  assertEqual(QuizCore.scoreAnswer({ correct: false, usedHint: false }), 0);
  assertEqual(QuizCore.scoreAnswer({ correct: false, usedHint: true }), 0);
});
test('formatScore', () => {
  assertEqual([14, 15, 0, 1].map(QuizCore.formatScore), ['7', '7.5', '0', '0.5']);
});
```

- [ ] **Step 2: 실패하는지 확인한다** — 기대: 새 검사 2개 실패
- [ ] **Step 3: 두 함수를 구현한다** (`formatScore`는 `halfPoints / 2`를 `String`으로 바꾸면 위 값이 나온다)
- [ ] **Step 4: 통과를 확인한다** — 기대: `실패 0`
- [ ] **Step 5: 커밋한다** — `git commit -am "feat: 점수 계산과 표시"`

### Task 3: 문항 데이터 검사 함수

**Files:**
- Modify: `script.js`(QuizCore), `tests/tests.js`

**Interfaces:**
- Produces: `QuizCore.validateQuestions(questions, categories) -> string[]`. 메시지 형식은 `"kh-01: 해설이 80자를 넘음"`처럼 문항 id로 시작한다. 전체 규칙 위반은 `"전체: ..."`, 카테고리 규칙 위반은 `"korean-history: 문항 9개"`.

- [ ] **Step 1: 실패하는 검사를 쓴다**

```js
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
];
for (const [label, mutate] of BROKEN) {
  test(`validateQuestions: ${label} → 오류`, () => {
    const qs = makeValidSet(); mutate(qs);
    assert(QuizCore.validateQuestions(qs, CATEGORIES).length > 0, label);
  });
}
```

- [ ] **Step 2: 실패하는지 확인한다** — 기대: 새 검사 모두 실패
- [ ] **Step 3: `validateQuestions`를 구현한다**

PRD 7.1의 문항 데이터 항목을 하나씩 확인한다. 최상급 낱말 목록은 `['가장', '최대', '최소', '최고', '최저', '최장', '최단', '최초', '제일']`이다. 이 중 하나가 있으면 `'기준'`도 있어야 한다. `checkedAt`은 `/^\d{4}-\d{2}-\d{2}$/`, 보기 공백 검사는 `trim()` 뒤에 한다.

- [ ] **Step 4: 통과를 확인한다** — 기대: `실패 0`
- [ ] **Step 5: 커밋한다** — `git commit -am "feat: 문항 데이터 자동 검사"`

### Task 4: 문항 40개 작성과 출처 확인

**Files:**
- Modify: `questions.js`, `tests/tests.js`

**Interfaces:**
- Consumes: `QuizCore.validateQuestions` (Task 3)
- Produces: `QUESTIONS` 40개 (id `kh-01`~`kh-10`, `wg-01`~`wg-10`, `sc-01`~`sc-10`, `ac-01`~`ac-10`)

- [ ] **Step 1: 실제 데이터 검사를 쓴다**

```js
test('문항 데이터: 40문항이 작성 규칙을 지킨다', () => {
  const errors = QuizCore.validateQuestions(QUESTIONS, CATEGORIES);
  assert(errors.length === 0, errors.join(' / '));
});
```

- [ ] **Step 2: 실패하는지 확인한다** — 기대: 실패, 이유에 `korean-history: 문항 0개` 등

- [ ] **Step 3~6: 카테고리마다(한국사 → 세계지리 → 과학 → 예술과 문화) 10문항을 쓴다**

카테고리마다 다음을 반복하고, 끝날 때마다 커밋한다(`git commit -am "content: 한국사 10문항"`).
1. 후보 문항마다 PRD 5.2의 공신력 있는 출처 페이지를 **실제로 열어** 정답 문장을 찾는다. 열어 본 페이지 주소만 `source.url`에 쓰고, 연 날짜를 `checkedAt`에 쓴다. 확인되지 않는 문항은 버린다.
2. 오답 3개는 같은 출처나 다른 공신력 있는 출처로 틀린 것이 분명한 것만 쓴다(동시대 인물, 이웃 나라 수도처럼 헷갈리지만 확실히 틀린 것).
3. 최상급 낱말이 들어가면 "~ 기준"과 필요하면 "(2025년 기준)"을 문제에 넣는다. 해설은 80자 이내 한 줄이다.
4. `tests/test.html`을 열어 그 카테고리 관련 오류가 없는지 본다.

- [ ] **Step 7: 전체 검사 통과를 확인한다** — 기대: `실패 0`

- [ ] **Step 8: 사람 검수표를 넘긴다**

40문항을 `id | 문제 | 정답 | 오답 3개 | 출처 제목 | URL` 표로 정리해 사용자에게 보여 준다. 사용자가 출처를 열어 대조하고, 고칠 문항을 알려 주면 고친 뒤 Step 7을 다시 한다. 승인을 받으면 `git commit -am "content: 40문항 검수 반영"`.

### Task 5: 앱 골격과 시작 화면

**Files:**
- Create: `index.html`, `style.css`
- Modify: `script.js`(화면 처리 부분 시작)

**Interfaces:**
- Consumes: `CATEGORIES`
- Produces (화면 처리 부분, 이후 작업이 모두 사용):
  - `const MODES = { practice: { name: '연습', rule: '시간 제한과 힌트 없음, 맞히면 1점' }, speed: { name: '스피드', rule: '문항마다 15초, 시간이 지나면 오답' }, hint: { name: '힌트', rule: '문항마다 힌트 1번(오답 2개 제거), 힌트를 쓰고 맞히면 0.5점' } }`
  - `let selectedMode = 'practice'`, `let game = null`(PRD 4.5 상태)
  - `el(id) -> Element`, `showScreen(name)`(`name`: `'mode' | 'start' | 'question' | 'result' | 'board'`, 다른 `.screen`은 `hidden`, 그 화면 제목에 `focus()`)
  - `goHome()`(1단계: 시작 화면), `renderStart()`, `init()`
  - 마크업 id(1단계): `#app`, `#screen-start`(`#start-title`, `#start-rule`, `#start-norecord`, `#category-list`), `#screen-question`(`#q-category`, `#q-progress`, `#q-score`, `#btn-quit`, `#q-text`, `#choice-list`, `#feedback`[aria-live="polite"], `#feedback-verdict`, `#feedback-explanation`, `#feedback-source`, `#btn-next`), `#screen-result`(`#result-title`, `#result-score`, `#result-correct`, `#result-hints`, `#result-norecord`, `#btn-again`, `#btn-home`)
  - CSS 클래스: `.screen`, `.choice`, `.is-correct`, `.is-wrong`, `.is-removed`, `.is-urgent`, `.is-highlight`

- [ ] **Step 1: `index.html` 마크업을 쓴다** — 위 id를 가진 `<section class="screen">` 3개, 각 제목은 `tabindex="-1"`. 끝에 `<script src="questions.js">`, `<script src="script.js">`.
- [ ] **Step 2: `style.css`를 쓴다** — 본문 최대 폭 40rem, 보기 버튼은 폭 100%·줄바꿈 허용, `.is-correct`(초록 테두리), `.is-wrong`(빨강 테두리), `.is-removed`(`opacity: .4`), `.is-urgent`(빨강 굵게). 360px에서 가로 스크롤이 없어야 한다.
- [ ] **Step 3: `renderStart()`와 `init()`을 구현한다** — `#category-list`에 `CATEGORIES`마다 `<button data-category="id">`를 만들고, `#start-rule`에 `MODES[selectedMode].rule`, 연습 모드면 `#start-norecord`("순위표에 기록되지 않음")를 보인다. 파일 끝: `if (document.getElementById('app')) init();`
- [ ] **Step 4: 브라우저로 확인한다** — `index.html`을 더블클릭해서 연다. 기대: 콘솔 오류 없음, 카테고리 버튼 4개, 규칙 한 줄, "순위표에 기록되지 않음"이 보인다. Tab 키로 버튼 4개를 차례로 지나간다. DevTools 기기 모드 360px에서 가로 스크롤이 없다.
- [ ] **Step 5: 자동 검사가 그대로인지 확인한다** — `tests/test.html` 기대: `실패 0`(화면 처리 코드가 실행되지 않음)
- [ ] **Step 6: 커밋한다** — `git add index.html style.css script.js && git commit -m "feat: 앱 골격과 시작 화면"`

### Task 6: 문제 화면과 피드백

**Files:**
- Modify: `script.js`, `style.css`

**Interfaces:**
- Consumes: `QuizCore.prepareItems`, `scoreAnswer`, `formatScore`, `questionsByCategory`, `showScreen`, `goHome`
- Produces: `startGame({ mode, categoryId, questionList, isRetry })`, `renderQuestion()`, `finishQuestion({ chosenIndex, timedOut })`, `nextQuestion()`, `quitGame()`. 진행 표시는 `${index + 1} / ${items.length}`(다시 풀기 판에서도 같은 함수 사용).

- [ ] **Step 1: `startGame`과 `renderQuestion`을 구현한다** — `game`을 PRD 4.5 형태로 만들고(`items = QuizCore.prepareItems(questionList, Math.random)`, `phase: 'answering'`) 문제 화면을 보인다. 보기는 `<button class="choice" data-index>`에 `textContent`로 넣는다. `#q-score`는 지금까지 `halfPoints` 합을 `formatScore`로 보인다.
- [ ] **Step 2: `finishQuestion`을 구현한다** — 맨 앞에 `if (game.phase !== 'answering') return;`(Review Focus 1). `results`에 `{ questionId, chosenIndex, correct, usedHint: game.usedHint, timedOut, halfPoints }`를 넣고 `phase = 'feedback'`으로 바꾼다. 보기를 모두 `disabled`로 만든 뒤, 정답 보기에는 `.is-correct`와 앞에 "✓ ", 고른 오답에는 `.is-wrong`과 앞에 "✗ "를 붙인다. `#feedback-verdict`에는 `timedOut ? '시간 초과' : correct ? '정답입니다' : '오답입니다'`, 그 아래 해설, 그 아래 작게 출처(`<a target="_blank" rel="noopener">`에 제목)를 보인다. `#btn-next` 글자는 마지막 문제면 "결과 보기", 아니면 "다음"이다.
- [ ] **Step 3: `nextQuestion`과 `quitGame`을 구현한다** — `nextQuestion`은 `if (game.phase !== 'feedback') return;`. 마지막이면 `showResult()`(Task 7)를, 아니면 `index++`, `usedHint = false`, `phase = 'answering'` 후 `renderQuestion()`. `quitGame`은 기록 없이 `game = null; goHome()`.
- [ ] **Step 4: 브라우저로 확인한다** — 한국사를 고른다. 기대: `1 / 10`, 점수 `0`. 보기를 고르면 4개 모두 잠기고 ✓/✗, "정답입니다"/"오답입니다", 해설, 출처 링크(새 탭)가 보인다. **보기를 아주 빠르게 두 번 누르고, [다음]도 빠르게 두 번 눌러도** 진행은 `2 / 10`이다. [그만두기]를 누르면 시작 화면으로 돌아간다.
- [ ] **Step 5: 커밋한다** — `git commit -am "feat: 문제 화면과 즉시 채점"`

### Task 7: 결과 화면

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: `game.results`, `formatScore`, `startGame`, `goHome`
- Produces: `showResult()`(맨 앞에서 `game.phase = 'done'`. 3단계에서는 여기서 기록을 저장한다.)

- [ ] **Step 1: `showResult`를 구현한다** — `#result-score`에 `${formatScore(합)} / ${items.length}`, `#result-correct`에 맞힌 수, `#result-hints`(힌트 모드만, 2단계에서 채움), 연습 모드면 `#result-norecord`를 보인다.
- [ ] **Step 2: 버튼을 연결한다** — [같은 모드 다시]는 `startGame({ mode: game.mode, categoryId: game.categoryId, questionList: QuizCore.questionsByCategory(QUESTIONS, game.categoryId), isRetry: false })`, [처음으로]는 `goHome()`.
- [ ] **Step 3: 브라우저로 확인한다** — 10문제를 끝까지 푼다. 기대: 점수가 맞힌 수와 같고 "순위표에 기록되지 않음"이 보인다. [같은 모드 다시]를 누르면 문항 순서와 보기 순서가 바뀐 새 판이 `1 / 10`부터 시작된다.
- [ ] **Step 4: 커밋한다** — `git commit -am "feat: 결과 화면"`

## 1단계 브라우저에서 직접 확인할 항목

`index.html`을 **더블클릭**해서 Chrome으로 열고, F12로 콘솔을 띄워 둔 채 확인한다.

- [ ] `tests/test.html`을 열면 맨 위가 `실패 0`이다.
- [ ] `index.html`을 열고 모든 항목을 확인하는 동안 콘솔에 빨간 오류가 하나도 없다.
- [ ] 시작 화면에 카테고리 버튼 4개, "시간 제한과 힌트 없음, 맞히면 1점", "순위표에 기록되지 않음"이 보인다.
- [ ] 카테고리 4개를 하나씩 골라 10문제를 끝까지 풀 수 있다.
- [ ] 같은 카테고리를 두 번 하면 문항 순서와 보기 순서가 달라진다.
- [ ] 답을 고르면 보기 4개가 잠기고, 고른 답과 정답이 색과 ✓/✗로 함께 구분된다.
- [ ] "정답입니다"/"오답입니다", 한 줄 해설, 작은 출처 링크가 보이고, 링크는 새 탭에서 열린다.
- [ ] 마지막 문제에서는 버튼이 [결과 보기]로 바뀐다.
- [ ] 결과 화면의 점수가 내가 맞힌 문항 수와 같고, "순위표에 기록되지 않음"이 보인다.
- [ ] 보기나 [다음]을 아주 빠르게 두 번 눌러도 문제를 건너뛰지 않는다.
- [ ] 문제 도중 [그만두기]를 누르면 시작 화면으로 돌아간다.
- [ ] 마우스 없이 Tab과 Enter/Space만으로 한 판을 끝까지 할 수 있고, 화면이 바뀌면 초점이 제목으로 간다.
- [ ] DevTools 기기 모드에서 폭 360px로 바꿔도 가로 스크롤이 생기지 않는다.
- [ ] Edge에서도 같은 판을 한 번 해 본다.

---

# 2단계: 스피드 모드, 힌트 모드, 틀린 문제 다시 풀기

## 만들 것

- 2단계 `QuizCore`: `pickHintRemovals`, `wrongQuestionIds`, `remainingSeconds`, `isTimedOut`, `resultLabel`
- 모드 선택 화면(카테고리를 고른 뒤에 나옴, 연습·스피드·힌트와 모드별 규칙 한 줄, 연습에만 "순위표에 기록되지 않음", [뒤로])
- 스피드 모드: 문항마다 15초, `Date.now()` 기준 계산, 5초 이하 강조, 시간 초과는 오답, 타이머는 하나만
- 힌트 모드: [힌트 (오답 2개 지우기)]로 오답 2개 흐리게 하고 취소선, 쓰면 [힌트 사용함], 힌트 쓰고 맞히면 0.5점, 결과에 힌트 쓴 문항 수
- 결과 화면의 문항별 결과 목록("정답", "정답 (힌트 0.5점)", "오답", "시간 초과")
- 연습 모드의 [틀린 문제 다시 풀기](다 맞힐 때까지 반복, 점수는 매기지 않고 처음 점수 유지)

## 완료 기준

- [ ] `tests/test.html`에서 1·2단계 검사가 모두 통과한다(`실패 0`).
- [ ] 아래 "2단계 브라우저 확인 항목"을 모두 확인했다.
- [ ] 1단계 브라우저 확인 항목 중 연습 모드 한 판을 다시 해서 망가진 곳이 없다.

### Task 8: 2단계 순수 함수

**Files:**
- Modify: `script.js`(QuizCore), `tests/tests.js`

**Interfaces:**
- Produces: `QuizCore.SPEED_LIMIT_MS = 15000`, `pickHintRemovals(item, rng) -> [number, number]`(오름차순), `wrongQuestionIds(results) -> string[]`, `remainingSeconds(startMs, nowMs) -> 0..15 정수`, `isTimedOut(startMs, nowMs) -> boolean`

- [ ] **Step 1: 실패하는 검사를 쓴다**

```js
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
```

- [ ] **Step 2: 실패하는지 확인한다** — 기대: 새 검사 3개 실패
- [ ] **Step 3: 네 함수를 구현한다** — `remainingSeconds`는 `ceil((15000 - 경과) / 1000)`을 0~15로 자른다. `pickHintRemovals`는 정답이 아닌 위치 3개를 `shuffle`해서 앞의 2개를 정렬해 돌려준다.
- [ ] **Step 4: 통과를 확인한다** — 기대: `실패 0`
- [ ] **Step 5: 커밋한다** — `git commit -am "feat: 힌트·타이머·다시 풀기 순수 함수"`

### Task 9: 모드 선택 화면

**Files:**
- Modify: `index.html`, `script.js`, `style.css`

**Interfaces:**
- Consumes: `MODES`, `CATEGORIES`, `renderStart`, `showScreen`
- Produces: `let selectedCategory`(1단계의 `selectedMode`를 대신함), `renderModes()`, 마크업 `#screen-mode`(`#mode-title`, `#mode-list`의 `[data-mode]` 버튼 3개와 규칙, `#btn-back`). 시작 화면에서 `#start-rule`, `#start-norecord`를 뺀다. `goHome()`은 계속 시작 화면으로 간다.

- [ ] **Step 1: 마크업을 추가한다** — 모드 선택 화면을 시작 화면 뒤에 두고 [뒤로]를 둔다. 시작 화면의 규칙 줄과 "순위표에 기록되지 않음"을 뺀다.
- [ ] **Step 2: 동작을 구현한다** — 카테고리 버튼을 누르면 `selectedCategory`를 바꾸고 `renderModes()` 후 모드 선택 화면으로 간다. `renderModes()`는 제목을 "(카테고리 이름) · 모드를 고르세요"로 하고, 모드 버튼마다 이름과 `MODES[mode].rule`을, 연습 버튼에만 "순위표에 기록되지 않음"을 붙인다. 모드 버튼은 `startGame({ mode, categoryId: selectedCategory, ... })`를 부른다. [뒤로]는 `goHome()`이다.
- [ ] **Step 3: 브라우저로 확인한다** — 첫 화면이 시작 화면(카테고리 4개)이고 "순위표에 기록되지 않음"이 없다. 과학을 고르면 "과학 · 모드를 고르세요"와 모드 3개, 모드마다 규칙 한 줄이 보이고, "순위표에 기록되지 않음"은 연습 버튼에만 있다. [뒤로]와 결과 화면의 [처음으로]는 시작 화면으로 간다.
- [ ] **Step 4: 커밋한다** — `git commit -am "feat: 모드 선택 화면"`

### Task 10: 스피드 모드 타이머

**Files:**
- Modify: `index.html`, `script.js`, `style.css`

**Interfaces:**
- Consumes: `QuizCore.remainingSeconds`, `isTimedOut`, `finishQuestion`
- Produces: `let timerId = null`, `startTimer()`, `stopTimer()`, `tick()`, 마크업 `#q-timer`

- [ ] **Step 1: 타이머를 구현한다** — `startTimer()`는 먼저 `stopTimer()`를 부르고 `game.startMs = Date.now()`, `timerId = setInterval(tick, 200)`. `tick()`은 `#q-timer`에 `remainingSeconds(game.startMs, Date.now())`를 쓰고, 5 이하면 `.is-urgent`를 붙인다. `isTimedOut`이면 `finishQuestion({ chosenIndex: null, timedOut: true })`.
- [ ] **Step 2: 정리 지점을 모두 연결한다** — `finishQuestion` 시작, `quitGame`, `startGame`, `showResult`에서 `stopTimer()`. `renderQuestion`은 스피드 모드일 때만 `#q-timer`를 보이고 `startTimer()`를 부른다. 시간 초과일 때 고른 보기 없이 정답 보기만 ✓로 표시한다.
- [ ] **Step 3: 브라우저로 확인한다** — 아래 2단계 항목 중 "스피드" 6개를 모두 확인한다. 특히 15초가 끝나는 순간에 보기를 눌러도 결과가 하나뿐이어야 한다(진행이 한 칸만 넘어감). 콘솔에서 `game.results.length`가 지금 문제 번호와 같아야 한다.
- [ ] **Step 4: 커밋한다** — `git commit -am "feat: 스피드 모드 15초 타이머"`

### Task 11: 힌트 모드

**Files:**
- Modify: `index.html`, `script.js`

**Interfaces:**
- Consumes: `QuizCore.pickHintRemovals`, `game.usedHint`
- Produces: `useHint()`, 마크업 `#btn-hint`

- [ ] **Step 1: 구현한다** — `renderQuestion`은 힌트 모드일 때만 `#btn-hint`를 보이고 풀어 둔다. `useHint()`는 `phase === 'answering' && !game.usedHint`일 때만 동작한다. 고른 두 위치의 보기에 `disabled`와 `.is-removed`를 주고(자리는 유지), `usedHint = true`로 바꾸고 [힌트]를 잠그며 글자를 "힌트 사용함"으로 바꾼다(`renderQuestion`에서 "힌트 (오답 2개 지우기)"로 되돌림). `.is-removed`는 흐리게 하고 취소선을 긋는다. `finishQuestion`도 [힌트]를 잠근다. 결과 화면 `#result-hints`에 "힌트를 쓴 문항: N개"를, `#result-list`에 문항마다 "문제 — `resultLabel`"을 보인다.
- [ ] **Step 2: 브라우저로 확인한다** — 아래 2단계 항목 중 "힌트" 5개를 모두 확인한다.
- [ ] **Step 3: 커밋한다** — `git commit -am "feat: 힌트 모드"`

### Task 12: 틀린 문제 다시 풀기

**Files:**
- Modify: `index.html`, `script.js`

**Interfaces:**
- Consumes: `QuizCore.wrongQuestionIds`, `startGame`
- Produces: 마크업 `#btn-retry`

- [ ] **Step 1: 구현한다** — `showResult`에서 `mode === 'practice'`이고 틀린 문항이 있을 때만 `#btn-retry`를 보인다. 누르면 `startGame({ mode: 'practice', categoryId, questionList: QUESTIONS.filter(q => ids.includes(q.id)), isRetry: true, keptScore })`. `keptScore`는 처음 판의 `{ halfPoints, count }`이고, 다시 풀기를 거듭해도 그대로 넘긴다. 다시 풀기 판의 문제 화면과 결과 화면은 이 점수를 보이고, 결과에는 "다시 풀기에서 맞힌 문항: N / M개"를 따로 보인다. [같은 모드 다시]는 다시 풀기 판에서도 `isRetry: false`인 10문항 판을 시작한다(Review Focus 3).
- [ ] **Step 2: 브라우저로 확인한다** — 아래 2단계 항목 중 "다시 풀기" 6개를 모두 확인한다.
- [ ] **Step 3: 커밋한다** — `git commit -am "feat: 틀린 문제 다시 풀기"`

## 2단계 브라우저에서 직접 확인할 항목

**공통**
- [ ] `tests/test.html`이 `실패 0`이다.
- [ ] 처음 화면이 시작 화면(카테고리 선택)이고, "순위표에 기록되지 않음" 문구가 없다.
- [ ] 카테고리를 고르면 "(카테고리) · 모드를 고르세요"가 나오고, 모드 3개마다 규칙 한 줄이 있으며, "순위표에 기록되지 않음"은 연습에만 있다.
- [ ] [뒤로]를 누르면 시작 화면으로 돌아간다.

**스피드**
- [ ] 문제가 나오면 15부터 1초씩 줄고, 5 이하가 되면 강조된다.
- [ ] 아무것도 고르지 않고 15초를 기다리면 "시간 초과"가 뜨고, 정답 보기에 ✓가 표시되고, 해설이 나오며, 점수가 오르지 않는다.
- [ ] 해설이 나와 있는 동안 10초 넘게 기다려도 남은 시간 숫자가 바뀌지 않는다.
- [ ] [다음]을 누르면 다시 15부터 센다.
- [ ] 결과 목록에 시간이 지난 문항이 "시간 초과"로 나온다.
- [ ] 문제를 띄운 채 다른 탭에서 20초 있다가 돌아오면 바로 "시간 초과"가 나와 있다.
- [ ] 문제 도중 [그만두기] → 바로 스피드 새 판을 시작한다. 숫자가 두 배 빠르게 줄거나 이전 판의 시간 초과가 끼어들지 않는다.

**힌트**
- [ ] [힌트 (오답 2개 지우기)]를 누르면 오답 2개만 흐려지고 취소선이 그어지며 눌리지 않는다. 정답과 오답 1개는 그대로 눌린다. 버튼 자리는 움직이지 않는다.
- [ ] 힌트를 쓴 뒤 버튼이 [힌트 사용함]으로 바뀌고 잠기며, 답을 고른 뒤에도 잠긴다. 다음 문항에서는 다시 쓸 수 있다.
- [ ] 힌트를 쓰고 맞히면 점수가 0.5 오르고(`0.5`, `1.5`처럼 표시), 힌트 없이 맞히면 1 오른다.
- [ ] 힌트를 쓰고 틀리면 점수가 오르지 않는다.
- [ ] 결과 화면에 "힌트를 쓴 문항" 수가 맞게 나오고, 점수가 `7.5 / 10` 같은 형식이며, 결과 목록에 "정답 (힌트 0.5점)"이 보인다.

**다시 풀기**
- [ ] 연습 모드에서 일부러 3문제를 틀리면 결과 화면에 [틀린 문제 다시 풀기]가 나오고, 누르면 그 3문제만 `1 / 3`부터 나온다.
- [ ] 다시 풀기 판에서는 맞히거나 틀려도 점수가 처음 판의 점수 그대로이고, 결과에도 처음 점수(예: `7 / 10`)와 "다시 풀기에서 맞힌 문항"이 나온다.
- [ ] 다시 풀기 판에서 또 틀리면 결과에 버튼이 다시 나오고, 다 맞히면 버튼이 사라진다.
- [ ] 1문제만 틀렸을 때 다시 풀기 판은 `1 / 1`부터 나온다.
- [ ] 다시 풀기 판 결과에서 [같은 모드 다시]를 누르면 점수 0부터 10문항 판이 시작된다.
- [ ] 스피드·힌트 모드 결과 화면에는 [틀린 문제 다시 풀기]가 없다.

---

# 3단계: 점수 저장과 순위표

> 2026-10-15: 노션 5.6.2(구현 3단계 결과의 브라우저 확인)에 맞춰 이 단계를 고쳤다. 순위표는 모드 × 카테고리 표 8개, 표마다 상위 5건이고, 이름은 스피드·힌트 결과 화면에서 넣고 [기록 저장]으로 저장한다.

## 만들 것

- 3단계 `QuizCore`: `boardKey`, `boardKeys`, `normalizeName`, `parseBoard`, `addRecord`, 그리고 날짜 표시용 `formatDate`
- `createQuizStore(getStorage)`: localStorage 읽기·쓰기를 `try/catch`로 감싼 저장소
- 스피드·힌트 결과 화면의 이름 입력칸과 [기록 저장](마지막 이름 미리 채우기, 비어 있으면 [기록 저장] 잠금)
- 순위표 화면(표 8개 — 스피드 · 카테고리 4개, 힌트 · 카테고리 4개 — 표마다 상위 5건, 칸은 순위·이름·점수·날짜, [처음으로])
- 시작 화면 맨 아래의 [순위표 보기]
- 저장할 수 없는 브라우저와 깨진 저장값 처리

[기록 지우기]는 만들지 않는다(PRD 10장).

## 완료 기준

- [ ] `tests/test.html`에서 1·2·3단계 검사가 모두 통과한다(`실패 0`).
- [ ] 아래 "3단계 브라우저 확인 항목"을 모두 확인했다.
- [ ] 연습·스피드·힌트 모드를 한 판씩 다시 해서 1·2단계 기능이 망가지지 않았다.

### Task 13: 이름 정리, 표 키, 저장값 검사

**Files:**
- Modify: `script.js`(QuizCore), `tests/tests.js`

**Interfaces:**
- Consumes: 전역 `CATEGORIES`(`questions.js`)
- Produces: `QuizCore.BOARD_MODES = ['speed', 'hint']`, `QuizCore.BOARD_SIZE = 5`, `boardKey(mode, categoryId) -> 'speed:science'`, `boardKeys(categories) -> string[8]`(스피드 4개 → 힌트 4개), `normalizeName(text) -> string | null`, `parseBoard(text) -> { [key]: Record[] }`. `Record`는 `{ name, halfPoints, date }`다.

- [ ] **Step 1: 실패하는 검사를 쓴다**

```js
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
```

- [ ] **Step 2: 실패하는지 확인한다** — 기대: 새 검사 실패
- [ ] **Step 3: 구현한다** — 최상위 값이 배열이 아닌 객체일 때만 읽는다. 키는 `boardKeys(CATEGORIES)` 8개만 받고, 값이 배열이 아니면 그 키를 버린다. 항목마다 `normalizeName(name) !== null`, `halfPoints`가 0~20 정수, `date`가 `Date.parse`로 읽히는 문자열인지 확인한다. 항목은 `{ name, halfPoints, date }`만 남기고, 표마다 앞의 `BOARD_SIZE`개까지 둔다. 남은 항목이 없는 키는 결과에서 뺀다.
- [ ] **Step 4: 통과를 확인한다** — 기대: `실패 0`
- [ ] **Step 5: 커밋한다**

### Task 14: 기록 추가와 날짜 표시

**Files:**
- Modify: `script.js`(QuizCore), `tests/tests.js`

**Interfaces:**
- Consumes: `QuizCore.BOARD_SIZE`
- Produces: `QuizCore.addRecord(board, key, { name, halfPoints, date }) -> { board, rank }`(`rank`는 1~5 또는 `null`, 입력 `board`는 바꾸지 않음), `QuizCore.formatDate(isoString) -> 'YYYY-MM-DD'`(로컬 날짜)

- [ ] **Step 1: 실패하는 검사를 쓴다**

```js
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
```

- [ ] **Step 2: 실패하는지 확인한다** — 기대: 새 검사 실패
- [ ] **Step 3: 구현한다** — 끼워 넣을 위치는 "`board[key]`의 기존 기록 중 `halfPoints`가 새 기록보다 **작은** 첫 위치"(없으면 맨 끝)다. 그 위치가 `BOARD_SIZE` 이상이면 `{ board: { ...board }, rank: null }`, 아니면 새 배열에 끼워 넣고 `BOARD_SIZE`개로 자른 뒤 `rank = 위치 + 1`.
- [ ] **Step 4: 통과를 확인한다** — 기대: `실패 0`
- [ ] **Step 5: 커밋한다**

### Task 15: 저장소

**Files:**
- Modify: `script.js`, `tests/tests.js`

**Interfaces:**
- Consumes: `QuizCore.parseBoard`
- Produces: `createQuizStore(getStorage)` → `{ loadBoard() -> { board, ok }, saveBoard(board) -> boolean, loadPlayerName() -> string, savePlayerName(name) -> boolean }`. 키는 `quiz.leaderboard.v1`, `quiz.playerName.v1`이다. `getStorage`는 `() => Storage`이고 호출 자체가 예외를 던질 수 있다. 앱에서는 `const store = createQuizStore(() => window.localStorage)`.

- [ ] **Step 1: 실패하는 검사를 쓴다**

```js
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
```

- [ ] **Step 2: 실패하는지 확인한다** — 기대: 새 검사 4개 실패
- [ ] **Step 3: 구현한다** — `QuizCore` 바깥, 화면 처리 위에 둔다. 메서드마다 `getStorage()` 호출부터 `try` 안에서 한다.
- [ ] **Step 4: 통과를 확인한다** — 기대: `실패 0`
- [ ] **Step 5: 커밋한다**

### Task 16: 결과 화면의 이름 입력과 기록 저장

**Files:**
- Modify: `script.js`, `index.html`, `style.css`

**Interfaces:**
- Consumes: `QuizCore.addRecord`, `boardKey`, `normalizeName`, `store`, `board`
- Produces: `let board = {}`, `let lastPlayerName = ''`(`init`에서 `store.loadBoard().board`, `store.loadPlayerName()`으로 채움), `game.saved`, `canSave()`, `updateSaveButton()`, `saveRecord()`, 마크업 `#save-form`(`<label for="player-name">이름 (1~10자)</label>`, `<input id="player-name" maxlength="10">`, `<button type="submit" id="btn-save">기록 저장</button>`, `#save-error`)

- [ ] **Step 1: 구현한다** — `showResult()`에서 스피드·힌트이고 `!isRetry`일 때만 `#save-form`을 점수(`#result-score`) 바로 아래에 보이고, 입력칸을 `lastPlayerName`으로 미리 채운다. `input` 이벤트마다 `normalizeName`이 `null`이면 [기록 저장]을 `disabled`로 잠근다. 폼을 제출하면 `saveRecord()`가 `addRecord(board, boardKey(mode, categoryId), { name, halfPoints, date: new Date().toISOString() })`로 새 표를 만들고 `store.saveBoard`로 저장한다. 성공하면 `board`를 바꾸고 `game.saved = true` 후 순위표 화면으로 간다. 실패하면 `board`는 그대로 두고 `#save-error`("기록을 저장할 수 없음")를 보이며 결과 화면에 머문다. `game.saved`로 두 번 눌러도 한 번만 저장한다(Review Focus 1). 이름을 저장할 때 `store.savePlayerName`도 부른다.
- [ ] **Step 2: 브라우저로 확인한다** — 아래 3단계 항목 중 "순위표와 저장칸", "기록이 쌓이는 모양"을 확인한다.
- [ ] **Step 3: 커밋한다**

### Task 17: 순위표 화면

**Files:**
- Modify: `index.html`, `script.js`, `style.css`

**Interfaces:**
- Consumes: `board`, `QuizCore.BOARD_MODES`, `boardKey`, `formatDate`, `formatScore`, `CATEGORIES`, `MODES`
- Produces: `openBoard()`, `renderBoard()`, 마크업 `#screen-board`(`#board-title`, `#board-list`, `#btn-board-home`), 시작 화면의 `#btn-board-open`

- [ ] **Step 1: 구현한다** — 시작 화면 맨 아래에 [순위표 보기]를 둔다. 순위표 화면은 스피드 · 한국사부터 힌트 · 예술과 문화까지 표 8개를 위에서 아래로 놓고, 표마다 "스피드 · 한국사" 같은 제목을 붙인다. 칸은 순위·이름·점수·날짜이고, 이름은 `textContent`로 넣는다. 빈 표는 "기록 없음"을 보인다. [처음으로]는 시작 화면으로 간다. 360px에서 이름 입력칸과 표가 가로 스크롤 없이 들어가야 한다.
- [ ] **Step 2: 브라우저로 확인한다** — 아래 3단계 항목 중 "저장이 안 될 때", "안전과 화면 폭"을 확인한다.
- [ ] **Step 3: 커밋한다**

## 3단계 브라우저에서 직접 확인할 항목

노션 5.6.2의 확인 항목 11개와 같다. 시작하기 전에 F12 → Application → Local Storage에서 `quiz.`로 시작하는 키를 지워 둔다.

**순위표와 저장칸 (3)**
- [ ] 시작 화면 맨 아래에 [순위표 보기]가 있고, 누르면 표 8개가 모두 "기록 없음"이다.
- [ ] 연습 모드 결과 화면에는 이름 입력칸과 [기록 저장]이 없다.
- [ ] 스피드·힌트 모드 결과 화면에는 점수 바로 아래에 이름 입력칸과 [기록 저장]이 있다. 이름이 비어 있거나 공백뿐이면 [기록 저장]이 눌리지 않고, 10자를 넘는 부분은 입력되지 않는다.

**기록이 쌓이는 모양 (4)**
- [ ] 이름을 넣고 [기록 저장]을 누르면 순위표 화면으로 가고, 그 판의 모드·카테고리 표에 순위, 이름, 점수, 날짜가 들어간다.
- [ ] 힌트 모드는 7.5 같은 점수가 그대로 보인다.
- [ ] 같은 카테고리·같은 모드로 6판을 풀어 판마다 저장하면, 그 표에 5건만 남고 가장 낮은 점수의 기록이 빠진다. 판마다 맞히는 문항 수를 달리하면 알아보기 쉽다.
- [ ] 새로고침하거나 브라우저를 닫았다 열어도 기록이 남아 있다.

**저장이 안 될 때 (2)**
- [ ] 기록이 한 건 이상 있는 상태에서 콘솔에 `localStorage.setItem("quiz.leaderboard.v1", "{깨짐")`을 입력하고 새로고침 → 순위표를 열면 표 8개가 모두 "기록 없음"이고 콘솔 오류가 없다. (앞서 쌓은 기록은 사라진다.)
- [ ] 콘솔에 `Storage.prototype.setItem = () => { throw new Error("막힘"); }`을 입력하고, 새로고침하지 않은 채 스피드 모드 한 판을 끝낸 뒤 저장 → "기록을 저장할 수 없음"이 나오고 결과 화면에 머문다. [처음으로]를 누르면 게임을 이어 할 수 있다. 확인이 끝나면 새로고침한다.

**안전과 화면 폭 (2)**
- [ ] 이름에 `<b>굵게</b>`를 넣어 저장해도 순위표에 굵게 보이지 않고 글자 그대로 보인다.
- [ ] 폭 360px에서 순위표와 이름 입력칸이 가로 스크롤 없이 보인다.
