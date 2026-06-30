const STORAGE_KEY = "vocab-routine-state-v2";
const LEGACY_STORAGE_KEY = "vocab-routine-state-v1";
const DAY = 24 * 60 * 60 * 1000;

const sampleWords = [
  {
    word: "abandon",
    meaning: "버리다, 포기하다",
    example: "He abandoned the plan after several failed attempts.",
    tag: "B1 동사",
  },
  {
    word: "brief",
    meaning: "짧은, 간단한",
    example: "She gave a brief explanation before the quiz.",
    tag: "기초",
  },
  {
    word: "steady",
    meaning: "꾸준한, 안정된",
    example: "A steady routine helps memory last longer.",
    tag: "형용사",
  },
  {
    word: "recall",
    meaning: "기억해내다",
    example: "Try to recall the meaning before checking the answer.",
    tag: "학습",
  },
];

const localDiagnosticQuestions = [
  {
    prompt: "Choose the closest meaning of maintain.",
    choices: ["유지하다", "발견하다", "숨기다", "비교하다"],
    answerIndex: 0,
    focus: "동사",
  },
  {
    prompt: "I need to ____ my schedule because the meeting changed.",
    choices: ["adjust", "admire", "avoid", "announce"],
    answerIndex: 0,
    focus: "문맥 추론",
  },
  {
    prompt: "Which word means 거의, 대략?",
    choices: ["approximately", "rarely", "barely", "formerly"],
    answerIndex: 0,
    focus: "부사",
  },
  {
    prompt: "The word consequence is closest to:",
    choices: ["결과", "습관", "요청", "증거"],
    answerIndex: 0,
    focus: "추상명사",
  },
  {
    prompt: "She was reluctant to speak. Reluctant means:",
    choices: ["꺼리는", "확신하는", "친절한", "빠른"],
    answerIndex: 0,
    focus: "형용사",
  },
];

const fallbackByGoal = {
  수능: [
    ["consequence", "결과", "Every choice has a consequence.", "수능 추상명사"],
    ["interpret", "해석하다", "Students should interpret the passage carefully.", "수능 동사"],
    ["significant", "중요한, 상당한", "The result showed a significant change.", "수능 형용사"],
    ["assume", "추정하다, 맡다", "Do not assume every detail is true.", "수능 동사"],
  ],
  토익: [
    ["invoice", "송장, 청구서", "Please review the invoice by Friday.", "토익 비즈니스"],
    ["confirm", "확인하다", "We need to confirm your reservation.", "토익 동사"],
    ["deadline", "마감일", "The deadline has been extended.", "토익 업무"],
    ["annual", "매년의", "The annual report is ready.", "토익 형용사"],
  ],
  회화: [
    ["actually", "사실은", "Actually, I have another idea.", "회화 부사"],
    ["probably", "아마도", "It will probably rain tonight.", "회화 부사"],
    ["prefer", "선호하다", "I prefer tea to coffee.", "회화 동사"],
    ["available", "시간이 되는, 이용 가능한", "Are you available tomorrow?", "회화 형용사"],
  ],
  비즈니스: [
    ["proposal", "제안서", "The proposal includes a new timeline.", "비즈니스 명사"],
    ["negotiate", "협상하다", "They will negotiate the contract.", "비즈니스 동사"],
    ["priority", "우선순위", "Customer safety is our top priority.", "비즈니스 명사"],
    ["efficient", "효율적인", "The new process is more efficient.", "비즈니스 형용사"],
  ],
  "뉴스 읽기": [
    ["policy", "정책", "The policy will affect small businesses.", "뉴스 명사"],
    ["increase", "증가하다", "Prices may increase next month.", "뉴스 동사"],
    ["announce", "발표하다", "The company announced a new plan.", "뉴스 동사"],
    ["evidence", "증거", "The report provides clear evidence.", "뉴스 명사"],
  ],
};

const initialState = {
  words: [],
  settings: {
    reinforce: true,
    ai: {
      provider: "gemini",
      apiKey: "",
      model: "gemini-3.5-flash",
    },
  },
  profile: {
    level: "미진단",
    goal: "수능",
    weaknesses: [],
    lastTestAt: "",
  },
  stats: {
    streak: 0,
    lastStudiedDate: "",
  },
};

let state = loadState();
let queue = [];
let currentCard = null;
let currentLevelTest = [];

const $ = (selector) => document.querySelector(selector);
const todayKey = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `word-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const elements = {
  dueCount: $("#dueCount"),
  totalCount: $("#totalCount"),
  streakCount: $("#streakCount"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  promptLabel: $("#promptLabel"),
  quizWord: $("#quizWord"),
  quizTag: $("#quizTag"),
  answerPanel: $("#answerPanel"),
  answerMeaning: $("#answerMeaning"),
  answerExample: $("#answerExample"),
  answerMemo: $("#answerMemo"),
  showAnswerButton: $("#showAnswerButton"),
  wrongButton: $("#wrongButton"),
  correctButton: $("#correctButton"),
  speakButton: $("#speakButton"),
  reinforceToggle: $("#reinforceToggle"),
  wordForm: $("#wordForm"),
  wordInput: $("#wordInput"),
  meaningInput: $("#meaningInput"),
  exampleInput: $("#exampleInput"),
  tagInput: $("#tagInput"),
  searchInput: $("#searchInput"),
  seedButton: $("#seedButton"),
  wordList: $("#wordList"),
  exportButton: $("#exportButton"),
  importInput: $("#importInput"),
  installButton: $("#installButton"),
  wordItemTemplate: $("#wordItemTemplate"),
  aiProvider: $("#aiProvider"),
  aiApiKey: $("#aiApiKey"),
  aiModel: $("#aiModel"),
  saveAiSettingsButton: $("#saveAiSettingsButton"),
  testAiButton: $("#testAiButton"),
  clearAiKeyButton: $("#clearAiKeyButton"),
  aiStatus: $("#aiStatus"),
  aiGoal: $("#aiGoal"),
  aiDifficulty: $("#aiDifficulty"),
  aiCount: $("#aiCount"),
  aiTopic: $("#aiTopic"),
  generateWordsButton: $("#generateWordsButton"),
  aiPreview: $("#aiPreview"),
  startLevelTestButton: $("#startLevelTestButton"),
  localLevelTestButton: $("#localLevelTestButton"),
  levelSummary: $("#levelSummary"),
  levelTestForm: $("#levelTestForm"),
};

function cloneInitialState() {
  return JSON.parse(JSON.stringify(initialState));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return cloneInitialState();
    const parsed = JSON.parse(raw);
    const merged = mergeState(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return cloneInitialState();
  }
}

function mergeState(parsed) {
  return {
    ...cloneInitialState(),
    ...parsed,
    settings: {
      ...initialState.settings,
      ...(parsed.settings || {}),
      ai: {
        ...initialState.settings.ai,
        ...((parsed.settings && parsed.settings.ai) || {}),
      },
    },
    profile: { ...initialState.profile, ...(parsed.profile || {}) },
    stats: { ...initialState.stats, ...(parsed.stats || {}) },
    words: Array.isArray(parsed.words) ? parsed.words.map(normalizeWord).filter(Boolean) : [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeWord(entry) {
  if (!entry || !entry.word || !entry.meaning) return null;
  return {
    id: entry.id || makeId(),
    word: String(entry.word).trim(),
    meaning: String(entry.meaning).trim(),
    example: String(entry.example || "").trim(),
    tag: String(entry.tag || "단어장").trim(),
    mastery: Number(entry.mastery || 0),
    correctCount: Number(entry.correctCount || 0),
    wrongCount: Number(entry.wrongCount || 0),
    lastStudiedAt: entry.lastStudiedAt || "",
    nextReviewAt: entry.nextReviewAt || todayKey(),
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

function dueWords() {
  const today = todayKey();
  return state.words.filter((word) => !word.nextReviewAt || word.nextReviewAt <= today);
}

function buildQueue() {
  const due = dueWords();
  const fallback = [...state.words].sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt)).slice(0, 8);
  queue = shuffle(due.length ? due : fallback).map((word) => ({ wordId: word.id, mode: "normal" }));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function getWord(id) {
  return state.words.find((word) => word.id === id);
}

function renderStats() {
  elements.dueCount.textContent = String(dueWords().length);
  elements.totalCount.textContent = String(state.words.length);
  elements.streakCount.textContent = `${state.stats.streak || 0}일`;
}

function renderStudy() {
  if (!state.words.length) {
    currentCard = null;
    elements.promptLabel.textContent = "단어장이 비어 있어요";
    elements.quizWord.textContent = "단어를 추가해 주세요";
    elements.quizTag.textContent = "AI 탭에서 자동 생성 가능";
    elements.answerPanel.hidden = true;
    setAnswerButtons(false);
    return;
  }

  if (!queue.length) buildQueue();
  currentCard = queue.shift();
  const word = getWord(currentCard.wordId);

  if (!word) {
    renderStudy();
    return;
  }

  elements.promptLabel.textContent =
    currentCard.mode === "reinforce" ? "방금 맞힌 단어 재확인" : "뜻을 떠올려 보세요";
  elements.quizWord.textContent = word.word;
  elements.quizTag.textContent = word.tag || "단어장";
  elements.answerMeaning.textContent = word.meaning;
  elements.answerExample.textContent = word.example || "예문이 아직 없어요.";
  elements.answerMemo.textContent =
    currentCard.mode === "reinforce" ? "두 번째로 맞히면 복습 간격이 더 늘어납니다." : "";
  elements.answerPanel.hidden = true;
  setAnswerButtons(false);
}

function setAnswerButtons(answerVisible) {
  elements.showAnswerButton.hidden = answerVisible || !currentCard;
  elements.wrongButton.hidden = !answerVisible || !currentCard;
  elements.correctButton.hidden = !answerVisible || !currentCard;
}

function updateStreak() {
  const today = todayKey();
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);

  if (state.stats.lastStudiedDate === today) return;
  state.stats.streak = state.stats.lastStudiedDate === yesterday ? state.stats.streak + 1 : 1;
  state.stats.lastStudiedDate = today;
}

function answerCurrent(isCorrect) {
  if (!currentCard) return;
  const word = getWord(currentCard.wordId);
  if (!word) return;

  updateStreak();
  word.lastStudiedAt = todayKey();

  if (isCorrect) {
    word.correctCount += 1;
    word.mastery = Math.min(5, word.mastery + (currentCard.mode === "reinforce" ? 1 : 0.6));
    const interval = [1, 1, 2, 4, 7, 14][Math.round(word.mastery)] || 21;
    word.nextReviewAt = addDays(interval);

    if (state.settings.reinforce && currentCard.mode !== "reinforce") {
      const offset = Math.min(queue.length, Math.floor(Math.random() * 3) + 2);
      queue.splice(offset, 0, { wordId: word.id, mode: "reinforce" });
    }
  } else {
    word.wrongCount += 1;
    word.mastery = Math.max(0, word.mastery - 1);
    word.nextReviewAt = todayKey();
    queue.splice(Math.min(2, queue.length), 0, { wordId: word.id, mode: "normal" });
  }

  saveState();
  renderAll();
  renderStudy();
}

function renderWords() {
  const query = elements.searchInput.value.trim().toLowerCase();
  elements.wordList.innerHTML = "";

  const filtered = state.words
    .filter((word) => `${word.word} ${word.meaning} ${word.tag}`.toLowerCase().includes(query))
    .sort((a, b) => a.word.localeCompare(b.word));

  if (!filtered.length) {
    elements.wordList.innerHTML = '<p class="empty">표시할 단어가 없어요.</p>';
    return;
  }

  filtered.forEach((word) => {
    const item = elements.wordItemTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector("strong").textContent = word.word;
    item.querySelector("span").textContent = `${word.meaning} · ${word.tag || "단어장"}`;
    item.querySelector("p").textContent = `정답 ${word.correctCount}회 · 오답 ${word.wrongCount}회 · 다음 복습 ${word.nextReviewAt}`;
    item.querySelector("button").addEventListener("click", () => {
      state.words = state.words.filter((entry) => entry.id !== word.id);
      queue = queue.filter((entry) => entry.wordId !== word.id);
      saveState();
      renderAll();
      renderStudy();
    });
    elements.wordList.append(item);
  });
}

function renderAiSettings() {
  elements.aiProvider.value = state.settings.ai.provider;
  elements.aiApiKey.value = state.settings.ai.apiKey;
  elements.aiModel.value = state.settings.ai.model;
  elements.aiGoal.value = state.profile.goal || "수능";
  const weaknesses = state.profile.weaknesses.length ? ` · 약점: ${state.profile.weaknesses.join(", ")}` : "";
  elements.levelSummary.textContent = `현재 레벨: ${state.profile.level}${weaknesses}`;
}

function renderAll() {
  elements.reinforceToggle.checked = state.settings.reinforce;
  renderStats();
  renderWords();
  renderAiSettings();
}

function addWord(entry) {
  const normalized = normalizeWord(entry);
  if (!normalized) return false;
  const duplicate = state.words.find((word) => word.word.toLowerCase() === normalized.word.toLowerCase());
  if (duplicate) {
    Object.assign(duplicate, { ...normalized, id: duplicate.id, createdAt: duplicate.createdAt });
  } else {
    state.words.push(normalized);
  }
  return true;
}

function addWords(entries) {
  const before = state.words.length;
  entries.forEach(addWord);
  saveState();
  queue = [];
  renderAll();
  renderStudy();
  return state.words.length - before;
}

function fallbackWords(goal, count, topic) {
  const base = fallbackByGoal[goal] || fallbackByGoal["수능"];
  const words = [];
  for (let index = 0; index < count; index += 1) {
    const item = base[index % base.length];
    words.push({
      word: item[0],
      meaning: item[1],
      example: item[2],
      tag: topic ? `${item[3]} · ${topic}` : item[3],
    });
  }
  return words;
}

function setAiStatus(message, tone = "") {
  elements.aiStatus.textContent = message;
  elements.aiStatus.className = `result ${tone}`.trim();
}

function explainAiError(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();

  if (lower.includes("quota") || lower.includes("rate") || lower.includes("resource_exhausted")) {
    return "AI 한도에 걸렸어요. 이 Google 프로젝트의 무료 한도가 0이거나 잠시 소진된 상태일 수 있습니다. AI Studio에서 사용량/결제 상태를 확인하거나 다른 모델/키로 다시 시도해 주세요.";
  }

  if (lower.includes("api key") || lower.includes("permission") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return "API 키 권한을 확인해 주세요. 키가 잘못됐거나 해당 프로젝트에서 Gemini API 사용이 꺼져 있을 수 있습니다.";
  }

  if (lower.includes("model") || lower.includes("not found")) {
    return "모델 이름을 확인해 주세요. Gemini는 gemini-3.5-flash 또는 gemini-2.5-flash-lite 같은 현재 모델을 권장합니다.";
  }

  return message;
}

function saveAiSettings() {
  const provider = elements.aiProvider.value;
  const fallbackModel = provider === "openai" ? "gpt-4.1-mini" : "gemini-3.5-flash";
  state.settings.ai = {
    provider,
    apiKey: elements.aiApiKey.value.trim(),
    model: elements.aiModel.value.trim() || fallbackModel,
  };
  state.profile.goal = elements.aiGoal.value;
  saveState();
  renderAiSettings();
}

function requireAiSettings() {
  saveAiSettings();
  if (state.settings.ai.provider === "none") throw new Error("AI 제공자가 꺼져 있어요.");
  if (!state.settings.ai.apiKey) throw new Error("API 키를 먼저 입력해 주세요.");
}

function buildWordPrompt({ goal, difficulty, count, topic }) {
  return `한국인 영어 학습자를 위한 단어장 ${count}개를 JSON으로만 만들어줘. 목표: ${goal}. 난이도: ${difficulty}. 현재 진단 레벨: ${state.profile.level}. 약점: ${state.profile.weaknesses.join(", ") || "없음"}. 주제: ${topic || "일반"}. 응답 형식은 {"words":[{"word":"영어 단어","meaning":"한국어 뜻","example":"짧은 영어 예문","tag":"레벨 또는 목표 태그"}]} 만 허용해.`;
}

function buildLevelTestPrompt() {
  return '한국인 영어 학습자의 어휘 레벨을 빠르게 진단할 객관식 문제 5개를 JSON으로만 만들어줘. 쉬운 문제 2개, 중간 문제 2개, 어려운 문제 1개로 구성해. 문제와 선택지는 짧게 써. 응답 형식은 {"questions":[{"prompt":"문제","choices":["선택지1","선택지2","선택지3","선택지4"],"answerIndex":0,"focus":"측정 영역"}]} 만 허용해.';
}

function buildEvaluationPrompt(answers, unknownCount = 0) {
  return `다음 영어 어휘 레벨 테스트 결과를 평가해줘. CEFR A1~C1 중 하나로 level을 정하고, 약점 2~4개와 추천 단어 12개를 JSON으로만 반환해. 결과 데이터: ${JSON.stringify(answers)}. 모르겠다 선택 수: ${unknownCount}. 응답 형식은 {"level":"B1","weaknesses":["동사","추상명사"],"recommendation":"짧은 한국어 코멘트","words":[{"word":"영어 단어","meaning":"한국어 뜻","example":"짧은 영어 예문","tag":"진단 추천"}]} 만 허용해.`;
}

function createAiTimeout(ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

async function callAiJson(prompt) {
  requireAiSettings();
  const { provider, apiKey, model } = state.settings.ai;
  const wrappedPrompt = `${prompt}\n\n중요: 설명 문장 없이 유효한 JSON 객체만 반환해.`;

  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const { controller, timer } = createAiTimeout();
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: wrappedPrompt }] }],
          generationConfig: { response_mime_type: "application/json" },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") throw new Error("AI 응답이 20초를 넘겨서 로컬 모드로 전환합니다.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Gemini 호출에 실패했어요.");
    return parseJsonText(data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || "");
  }

  if (provider === "openai") {
    const { controller, timer } = createAiTimeout();
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: wrappedPrompt,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") throw new Error("AI 응답이 20초를 넘겨서 로컬 모드로 전환합니다.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI 호출에 실패했어요.");
    const output = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n") || "";
    return parseJsonText(output);
  }

  throw new Error("지원하지 않는 AI 제공자예요.");
}
function parseJsonText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("AI 응답이 비어 있어요.");
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 응답에서 JSON을 찾지 못했어요.");
    return JSON.parse(match[0]);
  }
}

function sanitizeAiWords(data) {
  const words = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(words)) return [];
  return words.map(normalizeWord).filter(Boolean);
}

function renderPreview(words, label) {
  elements.aiPreview.innerHTML = "";
  const title = document.createElement("p");
  title.className = "preview-title";
  title.textContent = label;
  elements.aiPreview.append(title);
  words.slice(0, 10).forEach((word) => {
    const row = document.createElement("div");
    row.className = "preview-item";
    row.innerHTML = `<strong></strong><span></span>`;
    row.querySelector("strong").textContent = word.word;
    row.querySelector("span").textContent = `${word.meaning} · ${word.tag}`;
    elements.aiPreview.append(row);
  });
}

async function testAiConnection() {
  try {
    setAiStatus("연결을 테스트하는 중...", "loading");
    const data = await callAiJson('{"ok":true,"message":"연결 확인"} 형태의 JSON만 반환해.');
    setAiStatus(data.ok ? "AI 연결 성공. 이 키로 단어장 생성이 가능합니다." : "응답은 받았지만 형식이 예상과 달라요.", data.ok ? "success" : "warning");
  } catch (error) {
    setAiStatus(`${explainAiError(error)} 로컬 학습 기능은 계속 사용할 수 있어요.`, "warning");
  }
}

async function generateWordsFromAi() {
  const goal = elements.aiGoal.value;
  const difficulty = elements.aiDifficulty.value;
  const count = Number(elements.aiCount.value || 20);
  const topic = elements.aiTopic.value.trim();

  try {
    setAiStatus("AI가 단어장을 만드는 중...", "loading");
    const data = await callAiJson(buildWordPrompt({ goal, difficulty, count, topic }));
    const words = sanitizeAiWords(data);
    if (!words.length) throw new Error("추가할 단어를 찾지 못했어요.");
    const added = addWords(words);
    renderPreview(words, `AI 단어 ${words.length}개 생성 · 새로 추가 ${added}개`);
    setAiStatus("단어장이 로컬에 저장됐어요. 이제 오프라인으로도 학습할 수 있습니다.", "success");
  } catch (error) {
    const words = fallbackWords(goal, Math.min(count, 12), topic);
    const added = addWords(words);
    renderPreview(words, `AI 실패로 로컬 샘플 ${words.length}개 사용 · 새로 추가 ${added}개`);
    setAiStatus(`${explainAiError(error)} 대신 로컬 샘플 단어를 추가했어요.`, "warning");
  }
}

async function startLevelTest(useLocal = false) {
  try {
    setAiStatus(useLocal ? "로컬 샘플 테스트를 준비했어요." : "AI가 5문제 레벨 테스트를 만드는 중... 20초 넘으면 자동으로 로컬 테스트로 전환됩니다.", useLocal ? "success" : "loading");
    const data = useLocal ? { questions: localDiagnosticQuestions } : await callAiJson(buildLevelTestPrompt());
    const questions = Array.isArray(data.questions) ? data.questions : [];
    if (!questions.length) throw new Error("테스트 문제를 만들지 못했어요.");
    currentLevelTest = questions.slice(0, 5).map((question, index) => ({
      prompt: String(question.prompt || `문제 ${index + 1}`),
      choices: withUnknownChoice(Array.isArray(question.choices) ? question.choices.slice(0, 4).map(String) : []),
      answerIndex: Number(question.answerIndex || 0),
      focus: String(question.focus || "어휘"),
    })).filter((question) => question.choices.length >= 2);
    renderLevelTest();
  } catch (error) {
    currentLevelTest = localDiagnosticQuestions.slice(0, 5).map((question) => ({ ...question, choices: withUnknownChoice(question.choices) }));
    renderLevelTest();
    setAiStatus(`${explainAiError(error)} 로컬 샘플 테스트로 전환했어요.`, "warning");
  }
}

function withUnknownChoice(choices) {
  const cleanChoices = choices.map(String).filter(Boolean).filter((choice) => choice !== "모르겠다");
  return [...cleanChoices, "모르겠다"];
}

function renderLevelTest() {
  elements.levelTestForm.innerHTML = "";
  currentLevelTest.forEach((question, index) => {
    const block = document.createElement("fieldset");
    block.className = "test-question";
    const legend = document.createElement("legend");
    legend.textContent = `${index + 1}. ${question.prompt}`;
    block.append(legend);
    question.choices.forEach((choice, choiceIndex) => {
      const label = document.createElement("label");
      label.className = "choice";
      label.innerHTML = `<input type="radio" name="q${index}" value="${choiceIndex}" required><span></span>`;
      label.querySelector("span").textContent = choice;
      block.append(label);
    });
    elements.levelTestForm.append(block);
  });

  const submit = document.createElement("button");
  submit.className = "primary wide";
  submit.type = "submit";
  submit.textContent = "채점하고 추천 단어 추가";
  elements.levelTestForm.append(submit);
}

async function submitLevelTest(event) {
  event.preventDefault();
  if (!currentLevelTest.length) return;
  const answers = currentLevelTest.map((question, index) => {
    const selected = Number(new FormData(elements.levelTestForm).get(`q${index}`));
    return {
      prompt: question.prompt,
      selectedIndex: selected,
      selected: question.choices[selected],
      answerIndex: question.answerIndex,
      unknown: question.choices[selected] === "모르겠다",
      correct: selected === question.answerIndex,
      focus: question.focus,
    };
  });

  const correctCount = answers.filter((answer) => answer.correct).length;
  const unknownCount = answers.filter((answer) => answer.unknown).length;
  const localLevel = correctCount <= 2 ? "A1" : correctCount <= 4 ? "A2" : correctCount <= 6 ? "B1" : "B2";

  try {
    setAiStatus("AI가 결과를 평가하는 중...", "loading");
    const data = await callAiJson(buildEvaluationPrompt(answers, unknownCount));
    const words = sanitizeAiWords(data);
    state.profile.level = data.level || localLevel;
    state.profile.weaknesses = Array.isArray(data.weaknesses) ? data.weaknesses.slice(0, 4).map(String) : [];
    state.profile.lastTestAt = new Date().toISOString();
    const added = addWords(words);
    renderPreview(words, `진단 추천 단어 ${words.length}개 · 새로 추가 ${added}개`);
    setAiStatus(data.recommendation || `진단 레벨은 ${state.profile.level}입니다.`, "success");
  } catch (error) {
    const weak = answers.filter((answer) => !answer.correct).map((answer) => answer.focus).slice(0, 4);
    state.profile.level = localLevel;
    state.profile.weaknesses = [...new Set(weak.length ? weak : ["어휘 recall"] )];
    state.profile.lastTestAt = new Date().toISOString();
    const words = fallbackWords(state.profile.goal, 12, state.profile.weaknesses[0]);
    const added = addWords(words);
    renderPreview(words, `로컬 진단 추천 ${words.length}개 · 새로 추가 ${added}개`);
    setAiStatus(`${explainAiError(error)} 로컬 채점 결과 ${localLevel}로 저장했어요.`, "warning");
  }
}

function exportData() {
  const exportState = mergeState({ ...state, settings: { ...state.settings, ai: { ...state.settings.ai, apiKey: "" } } });
  const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vocab-routine-${todayKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      if (!Array.isArray(imported.words)) throw new Error("Invalid backup");
      const currentKey = state.settings.ai.apiKey;
      state = mergeState(imported);
      state.settings.ai.apiKey = currentKey;
      queue = [];
      saveState();
      renderAll();
      renderStudy();
      alert("가져왔어요. API 키는 기존 브라우저 설정을 유지합니다.");
    } catch {
      alert("가져올 수 없는 파일이에요.");
    }
  };
  reader.readAsText(file);
}

function speakCurrentWord() {
  if (!currentCard || !("speechSynthesis" in window)) return;
  const word = getWord(currentCard.wordId);
  if (!word) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word.word);
  utterance.lang = "en-US";
  speechSynthesis.speak(utterance);
}

function registerEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      elements.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      elements.views.forEach((view) => view.classList.toggle("is-active", view.id === `${tab.dataset.view}View`));
    });
  });

  elements.showAnswerButton.addEventListener("click", () => {
    elements.answerPanel.hidden = false;
    setAnswerButtons(true);
  });

  elements.correctButton.addEventListener("click", () => answerCurrent(true));
  elements.wrongButton.addEventListener("click", () => answerCurrent(false));
  elements.speakButton.addEventListener("click", speakCurrentWord);

  elements.reinforceToggle.addEventListener("change", () => {
    state.settings.reinforce = elements.reinforceToggle.checked;
    saveState();
  });

  elements.wordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addWords([{
      word: elements.wordInput.value,
      meaning: elements.meaningInput.value,
      example: elements.exampleInput.value,
      tag: elements.tagInput.value,
    }]);
    elements.wordForm.reset();
  });

  elements.searchInput.addEventListener("input", renderWords);
  elements.seedButton.addEventListener("click", () => addWords(sampleWords));
  elements.exportButton.addEventListener("click", exportData);
  elements.importInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importData(file);
    event.target.value = "";
  });

  elements.aiProvider.addEventListener("change", () => {
    if (!elements.aiModel.value || ["gemini-2.0-flash", "gemini-3.5-flash", "gpt-4.1-mini"].includes(elements.aiModel.value)) {
      elements.aiModel.value = elements.aiProvider.value === "openai" ? "gpt-4.1-mini" : "gemini-3.5-flash";
    }
  });
  elements.saveAiSettingsButton.addEventListener("click", () => {
    saveAiSettings();
    setAiStatus("AI 설정을 이 브라우저에 저장했어요.", "success");
  });
  elements.testAiButton.addEventListener("click", testAiConnection);
  elements.clearAiKeyButton.addEventListener("click", () => {
    state.settings.ai.apiKey = "";
    saveState();
    renderAiSettings();
    setAiStatus("API 키를 이 브라우저에서 삭제했어요.", "success");
  });
  elements.generateWordsButton.addEventListener("click", generateWordsFromAi);
  elements.startLevelTestButton.addEventListener("click", () => startLevelTest(false));
  elements.localLevelTestButton.addEventListener("click", () => startLevelTest(true));
  elements.levelTestForm.addEventListener("submit", submitLevelTest);
}

function registerPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    elements.installButton.hidden = true;
  });
}

registerEvents();
registerPwa();
renderAll();
renderStudy();
