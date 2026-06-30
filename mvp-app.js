const DB_NAME = "vocab-routine-mvp";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const STATE_KEY = "state";
const LEGACY_KEYS = ["vocab-routine-state-v2", "vocab-routine-state-v1"];
const DAY = 24 * 60 * 60 * 1000;

const LEVELS = [
  { grade: "9급", label: "입문", min: 0, next: 50, opic: "NH~IL", toeic: "Novice High", focus: "일상 기본 명사, 쉬운 동사, 짧은 답변" },
  { grade: "8급", label: "기초", min: 50, next: 120, opic: "IL~IM1", toeic: "Intermediate Low", focus: "취미, 가족, 장소 묘사, 빈도 표현" },
  { grade: "7급", label: "초중급", min: 120, next: 250, opic: "IM1", toeic: "Intermediate Low~Mid", focus: "경험 설명, 이유 말하기, 연결어" },
  { grade: "6급", label: "중급", min: 250, next: 450, opic: "IM2", toeic: "Intermediate Mid", focus: "문제 상황, 비교, 과거 경험 설명" },
  { grade: "5급", label: "중상급", min: 450, next: 700, opic: "IM3", toeic: "Intermediate High", focus: "구체적 묘사, 감정/의견, 상황별 표현" },
  { grade: "4급", label: "실전", min: 700, next: 1000, opic: "IH", toeic: "Intermediate High~Advanced Low", focus: "논리 전개, 해결책 제시, 자연스러운 부사구" },
  { grade: "3급", label: "고급", min: 1000, next: 1400, opic: "AL", toeic: "Advanced Low", focus: "추상 주제, 사회 이슈, 뉘앙스 있는 표현" },
  { grade: "2급", label: "심화", min: 1400, next: 1900, opic: "AL 이상", toeic: "Advanced Mid", focus: "정교한 의견, 설득, 비즈니스/뉴스 어휘" },
  { grade: "1급", label: "자유 운용", min: 1900, next: Infinity, opic: "AL 안정권", toeic: "Advanced High", focus: "콜로케이션, 관용 표현, 즉흥 답변" },
];

const sampleWords = [
  { word: "memorable", meaning: "기억에 남는", example: "It was a memorable trip.", tag: "8급 회화" },
  { word: "prefer", meaning: "선호하다", example: "I prefer quiet places.", tag: "8급 동사" },
  { word: "recommend", meaning: "추천하다", example: "I recommend this cafe.", tag: "7급 동사" },
  { word: "convenient", meaning: "편리한", example: "The subway is convenient.", tag: "7급 형용사" },
  { word: "solve", meaning: "해결하다", example: "I tried to solve the problem.", tag: "6급 동사" },
];

const initialState = {
  words: [],
  settings: { ai: { provider: "gemini", apiKey: "", model: "gemini-3.5-flash" } },
  stats: { streak: 0, lastStudiedDate: "" },
  profile: { targetLevel: "8급" },
};

let db;
let state = structuredClone(initialState);
let queue = [];
let currentCard = null;

const $ = (selector) => document.querySelector(selector);
const todayKey = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

const el = {
  tabs: document.querySelectorAll(".tab"), views: document.querySelectorAll(".view"), installButton: $("#installButton"),
  todayHeadline: $("#todayHeadline"), todaySubtext: $("#todaySubtext"), startStudyButton: $("#startStudyButton"), dueCount: $("#dueCount"), masteredCount: $("#masteredCount"), streakCount: $("#streakCount"), currentGrade: $("#currentGrade"), nextGradeText: $("#nextGradeText"), gradeProgress: $("#gradeProgress"),
  promptLabel: $("#promptLabel"), quizWord: $("#quizWord"), quizTag: $("#quizTag"), answerPanel: $("#answerPanel"), answerMeaning: $("#answerMeaning"), answerExample: $("#answerExample"), answerNote: $("#answerNote"), answerInput: $("#answerInput"), showAnswerButton: $("#showAnswerButton"), wrongButton: $("#wrongButton"), unknownButton: $("#unknownButton"), correctButton: $("#correctButton"), speakButton: $("#speakButton"),
  wordForm: $("#wordForm"), wordInput: $("#wordInput"), meaningInput: $("#meaningInput"), exampleInput: $("#exampleInput"), bulkInput: $("#bulkInput"), bulkAddButton: $("#bulkAddButton"), bulkStatus: $("#bulkStatus"), searchInput: $("#searchInput"), weakFilter: $("#weakFilter"), seedButton: $("#seedButton"), wordList: $("#wordList"), wordItemTemplate: $("#wordItemTemplate"), exportDeckButton: $("#exportDeckButton"), importDeckInput: $("#importDeckInput"),
  levelTitle: $("#levelTitle"), levelMeta: $("#levelMeta"), levelFocus: $("#levelFocus"), studyTargetText: $("#studyTargetText"), aiProvider: $("#aiProvider"), aiApiKey: $("#aiApiKey"), aiModel: $("#aiModel"), targetLevel: $("#targetLevel"), aiTopic: $("#aiTopic"), saveAiButton: $("#saveAiButton"), generateDeckButton: $("#generateDeckButton"), aiStatus: $("#aiStatus"), aiPreview: $("#aiPreview"), levelLadder: $("#levelLadder"),
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbSet(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function makeId() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `word-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeWord(entry) {
  if (!entry || !entry.word || !entry.meaning) return null;
  return {
    id: entry.id || makeId(), word: String(entry.word).trim(), meaning: String(entry.meaning).trim(),
    example: String(entry.example || "").trim(), tag: String(entry.tag || "단어장").trim(), note: String(entry.note || "").trim(),
    mastery: Number(entry.mastery || 0), correctCount: Number(entry.correctCount || 0), wrongCount: Number(entry.wrongCount || 0), unknownCount: Number(entry.unknownCount || 0),
    lastStudiedAt: entry.lastStudiedAt || "", nextReviewAt: entry.nextReviewAt || todayKey(), createdAt: entry.createdAt || new Date().toISOString(),
  };
}

function mergeState(value) {
  const merged = { ...structuredClone(initialState), ...(value || {}) };
  merged.settings = { ...initialState.settings, ...(value?.settings || {}), ai: { ...initialState.settings.ai, ...(value?.settings?.ai || {}) } };
  merged.stats = { ...initialState.stats, ...(value?.stats || {}) };
  merged.profile = { ...initialState.profile, ...(value?.profile || {}) };
  merged.words = Array.isArray(value?.words) ? value.words.map(normalizeWord).filter(Boolean) : [];
  return merged;
}

async function loadState() {
  const saved = await idbGet(STATE_KEY);
  if (saved) return mergeState(saved);
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const migrated = mergeState(JSON.parse(raw));
        await idbSet(STATE_KEY, migrated);
        return migrated;
      }
    } catch {}
  }
  return structuredClone(initialState);
}

async function saveState() { await idbSet(STATE_KEY, state); }
function dueWords() { const today = todayKey(); return state.words.filter((word) => !word.nextReviewAt || word.nextReviewAt <= today); }
function masteredWords() { return state.words.filter((word) => Number(word.mastery || 0) >= 3); }
function levelByMastered(count) { return [...LEVELS].reverse().find((level) => count >= level.min) || LEVELS[0]; }
function targetLevel() { return LEVELS.find((level) => level.grade === state.profile.targetLevel) || LEVELS[1]; }
function shuffle(items) { return [...items].sort(() => Math.random() - 0.5); }

function buildQueue() {
  const due = dueWords();
  const fallback = [...state.words].sort((a, b) => (a.nextReviewAt || "").localeCompare(b.nextReviewAt || "")).slice(0, 10);
  queue = shuffle(due.length ? due : fallback).map((word) => ({ wordId: word.id, mode: "normal", direction: Math.random() < 0.35 ? "meaning-to-word" : "word-to-meaning" }));
}

function switchView(name) {
  el.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === name));
  el.views.forEach((view) => view.classList.toggle("is-active", view.id === `${name}View`));
}

function renderAll() { renderToday(); renderStudy(); renderWords(); renderLevel(); }

function renderToday() {
  const due = dueWords().length;
  const mastered = masteredWords().length;
  const level = levelByMastered(mastered);
  const next = LEVELS[LEVELS.indexOf(level) + 1];
  el.dueCount.textContent = String(due);
  el.masteredCount.textContent = String(mastered);
  el.streakCount.textContent = `${state.stats.streak || 0}일`;
  el.todayHeadline.textContent = due ? `오늘 복습 ${due}개` : "오늘은 가볍게 복습해도 좋아요";
  el.todaySubtext.textContent = state.words.length ? `전체 ${state.words.length}개 중 ${mastered}개가 숙련 상태입니다.` : "단어장에서 샘플을 넣거나 레벨 탭에서 AI 단어장을 만들어 보세요.";
  el.currentGrade.textContent = `${level.grade} ${level.label}`;
  if (next) {
    const span = next.min - level.min;
    const done = Math.max(0, mastered - level.min);
    const remaining = Math.max(0, next.min - mastered);
    el.nextGradeText.textContent = `다음 ${next.grade}까지 ${remaining}개 남음`;
    el.gradeProgress.style.width = `${Math.min(100, Math.round((done / span) * 100))}%`;
  } else {
    el.nextGradeText.textContent = "최고 급수입니다";
    el.gradeProgress.style.width = "100%";
  }
}

function renderStudy() {
  if (!state.words.length) {
    currentCard = null;
    el.promptLabel.textContent = "단어장이 비어 있어요";
    el.quizWord.textContent = "단어를 추가해 주세요";
    el.quizTag.textContent = "단어장";
    el.answerPanel.hidden = true;
    if (el.answerInput) { el.answerInput.value = ""; el.answerInput.disabled = true; }
    setAnswerButtons(false);
    return;
  }
  if (!currentCard) {
    if (!queue.length) buildQueue();
    currentCard = queue.shift() || null;
  }
  const word = state.words.find((item) => item.id === currentCard?.wordId) || state.words[0];
  currentCard = { wordId: word.id, mode: currentCard?.mode || "normal", direction: currentCard?.direction || "word-to-meaning" };
  const reverse = currentCard.direction === "meaning-to-word";
  el.promptLabel.textContent = currentCard.mode === "reinforce" ? "방금 맞힌 단어 재확인" : (reverse ? "뜻을 보고 영어를 떠올려 보세요" : "단어의 뜻을 떠올려 보세요");
  el.quizWord.textContent = reverse ? word.meaning : word.word;
  el.quizTag.textContent = reverse ? "뜻 → 영어" : (word.tag || "단어장");
  el.answerMeaning.textContent = reverse ? word.word : word.meaning;
  el.answerExample.textContent = word.example || "예문이 아직 없어요.";
  el.answerNote.textContent = word.note || "";
  el.answerPanel.hidden = true;
  if (el.answerInput) { el.answerInput.value = ""; el.answerInput.disabled = false; el.answerInput.placeholder = reverse ? "영어 단어를 입력해보세요" : "뜻을 입력해보세요"; }
  setAnswerButtons(false);
}

function setAnswerButtons(answerVisible) {
  el.showAnswerButton.hidden = answerVisible || !currentCard;
  el.wrongButton.hidden = !answerVisible || !currentCard;
  el.unknownButton.hidden = !answerVisible || !currentCard;
  el.correctButton.hidden = !answerVisible || !currentCard;
}

function updateStreak() {
  const today = todayKey();
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  if (state.stats.lastStudiedDate === today) return;
  state.stats.streak = state.stats.lastStudiedDate === yesterday ? state.stats.streak + 1 : 1;
  state.stats.lastStudiedDate = today;
}

async function answerCurrent(result) {
  const word = state.words.find((item) => item.id === currentCard?.wordId);
  if (!word) return;
  updateStreak();
  word.lastStudiedAt = todayKey();
  if (result === "correct") {
    word.correctCount += 1;
    word.mastery = Math.min(3, word.mastery + (currentCard.mode === "reinforce" ? 1 : 0.8));
    word.nextReviewAt = addDays([1, 2, 5, 10][Math.round(word.mastery)] || 14);
    if (currentCard.mode !== "reinforce") queue.splice(Math.min(queue.length, 2), 0, { wordId: word.id, mode: "reinforce", direction: currentCard.direction });
  } else {
    if (result === "unknown") word.unknownCount += 1;
    else word.wrongCount += 1;
    word.mastery = Math.max(0, word.mastery - (result === "unknown" ? 0.4 : 1));
    word.nextReviewAt = todayKey();
    queue.splice(Math.min(queue.length, 2), 0, { wordId: word.id, mode: "normal", direction: currentCard.direction });
  }
  currentCard = null;
  await saveState();
  renderAll();
}

function renderWords() {
  const query = el.searchInput.value.trim().toLowerCase();
  const filter = el.weakFilter?.value || "all";
  const filtered = state.words.filter((word) => `${word.word} ${word.meaning} ${word.tag}`.toLowerCase().includes(query) && matchesWordFilter(word, filter)).sort((a, b) => a.word.localeCompare(b.word));
  el.wordList.innerHTML = "";
  if (!filtered.length) { el.wordList.innerHTML = '<p class="empty">표시할 단어가 없어요.</p>'; return; }
  filtered.forEach((word) => {
    const item = el.wordItemTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector("strong").textContent = word.word;
    item.querySelector("span").textContent = `${word.meaning} · 숙련 ${Math.round(word.mastery)}/3`;
    item.querySelector("p").textContent = `다음 복습 ${word.nextReviewAt} · 정답 ${word.correctCount} · 오답 ${word.wrongCount} · 모름 ${word.unknownCount || 0}`;
    item.querySelector("button").addEventListener("click", async () => {
      state.words = state.words.filter((item) => item.id !== word.id);
      currentCard = null; queue = [];
      await saveState(); renderAll();
    });
    el.wordList.append(item);
  });
}

function renderLevel() {
  const mastered = masteredWords().length;
  const current = levelByMastered(mastered);
  el.levelTitle.textContent = `${current.grade} ${current.label}`;
  el.levelMeta.textContent = `OPIc ${current.opic} · TOEIC Speaking ${current.toeic}`;
  el.levelFocus.textContent = current.focus;
  const selectedTarget = targetLevel();
  if (el.studyTargetText) el.studyTargetText.textContent = `공부할 단계: ${selectedTarget.grade} ${selectedTarget.label} · OPIc ${selectedTarget.opic}`;
  el.aiProvider.value = state.settings.ai.provider;
  el.aiApiKey.value = state.settings.ai.apiKey;
  el.aiModel.value = state.settings.ai.model;
  el.targetLevel.innerHTML = "";
  LEVELS.forEach((level) => {
    const option = document.createElement("option");
    option.value = level.grade;
    option.textContent = `${level.grade} ${level.label} · OPIc ${level.opic}`;
    option.selected = level.grade === state.profile.targetLevel;
    el.targetLevel.append(option);
  });
  el.levelLadder.innerHTML = "";
  LEVELS.forEach((level) => {
    const card = document.createElement("article");
    card.className = level.grade === current.grade ? "is-current" : "";
    card.innerHTML = `<strong>${level.grade} ${level.label}</strong><span>OPIc ${level.opic} · TS ${level.toeic}</span><p>${level.focus}</p>`;
    el.levelLadder.append(card);
  });
}

function wordKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function addWord(entry, { updateExisting = true } = {}) {
  const word = normalizeWord(entry);
  if (!word) return "invalid";
  const existing = state.words.find((item) => wordKey(item.word) === wordKey(word.word));
  if (existing) {
    if (updateExisting) Object.assign(existing, { ...existing, ...word, id: existing.id, createdAt: existing.createdAt });
    return "duplicate";
  }
  state.words.push(word);
  return "added";
}

async function addWords(entries, options = {}) {
  const result = { added: 0, duplicate: 0, invalid: 0 };
  entries.forEach((entry) => {
    const status = addWord(entry, options);
    result[status] += 1;
  });
  currentCard = null; queue = [];
  await saveState(); renderAll();
  return result;
}

function parseBulkWords(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*(?:\t|,| - | ? | ? |:)\s*/).filter(Boolean);
      if (parts.length < 2) return null;
      return { word: parts[0], meaning: parts.slice(1).join(" ") };
    })
    .filter(Boolean);
}

function matchesWordFilter(word, filter) {
  if (filter === "weak") return Number(word.mastery || 0) < 2 || Number(word.wrongCount || 0) > 0 || Number(word.unknownCount || 0) > 0;
  if (filter === "unknown") return Number(word.unknownCount || 0) > 0;
  if (filter === "wrong") return Number(word.wrongCount || 0) > 0;
  if (filter === "new") return !word.lastStudiedAt && Number(word.mastery || 0) === 0;
  if (filter === "mastered") return Number(word.mastery || 0) >= 3;
  return true;
}

function deckPayload() {
  const level = targetLevel();
  return {
    type: "vocab-routine-deck",
    schemaVersion: 1,
    title: `단어 루틴 ${todayKey()} 단어장`,
    level: { grade: level.grade, opic: level.opic, toeicSpeaking: level.toeic },
    words: state.words.map(({ word, meaning, example, tag, note }) => ({ word, meaning, example, tag, note })),
    createdAt: new Date().toISOString(),
  };
}

function exportDeck() {
  const blob = new Blob([JSON.stringify(deckPayload(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vocab-deck-${todayKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importDeck(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(String(reader.result));
      const words = Array.isArray(data.words) ? data.words : Array.isArray(data) ? data : [];
      if (!words.length) throw new Error("empty");
      await addWords(words);
      alert(`${words.length}개 단어를 가져왔어요.`);
    } catch {
      alert("가져올 수 없는 단어장 파일이에요.");
    }
  };
  reader.readAsText(file);
}

function saveAiSettings() {
  state.settings.ai = {
    provider: el.aiProvider.value,
    apiKey: el.aiApiKey.value.trim(),
    model: el.aiModel.value.trim() || (el.aiProvider.value === "openai" ? "gpt-4.1-mini" : "gemini-3.5-flash"),
  };
  state.profile.targetLevel = el.targetLevel.value;
  return saveState();
}

function setAiStatus(message, tone = "") { el.aiStatus.textContent = message; el.aiStatus.className = `result ${tone}`.trim(); }
function createAiTimeout(ms = 20000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), ms); return { controller, timer }; }
function extractFirstJsonObject(text) {
  const source = String(text || "").trim();
  const start = source.indexOf("{");
  if (start === -1) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return "";
}

function parseJsonText(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstObject = extractFirstJsonObject(trimmed);
    if (!firstObject) throw new Error("AI 응답에서 JSON을 찾지 못했어요.");
    return JSON.parse(firstObject);
  }
}

async function callAiJson(prompt) {
  await saveAiSettings();
  const { provider, apiKey, model } = state.settings.ai;
  if (provider === "none") throw new Error("AI 제공자가 꺼져 있어요.");
  if (!apiKey) throw new Error("API 키를 먼저 입력해 주세요.");
  const wrapped = `${prompt}\n\n중요: 설명 없이 유효한 JSON 객체만 반환해.`;
  if (provider === "gemini") {
    const { controller, timer } = createAiTimeout();
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: wrapped }] }], generationConfig: { response_mime_type: "application/json" } }), signal: controller.signal });
    } catch (error) { if (error.name === "AbortError") throw new Error("AI 응답이 20초를 넘겼어요."); throw error; }
    finally { clearTimeout(timer); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Gemini 호출에 실패했어요.");
    return parseJsonText(data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || "");
  }
  const { controller, timer } = createAiTimeout();
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, input: wrapped }), signal: controller.signal });
  } catch (error) { if (error.name === "AbortError") throw new Error("AI 응답이 20초를 넘겼어요."); throw error; }
  finally { clearTimeout(timer); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OpenAI 호출에 실패했어요.");
  return parseJsonText(data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n") || "");
}

function aiErrorMessage(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  if (lower.includes("quota") || lower.includes("rate")) return "AI 한도에 걸렸어요. 잠시 뒤 다시 시도하거나 다른 키/모델을 사용해 주세요.";
  if (lower.includes("api key") || lower.includes("forbidden") || lower.includes("unauthorized")) return "API 키 권한을 확인해 주세요.";
  return message || "AI 호출에 실패했어요.";
}

async function generateDeck() {
  const level = LEVELS.find((item) => item.grade === el.targetLevel.value) || LEVELS[1];
  const topic = el.aiTopic.value.trim() || "일상 회화";
  const existingWords = state.words.map((word) => word.word);
  const existing = existingWords.slice(-200).join(", ");
  const prompt = `한국인 영어 말하기 학습자를 위한 ${level.grade} ${level.label} 단어 20개를 JSON으로만 만들어줘. OPIc ${level.opic}, TOEIC Speaking ${level.toeic} 목표 감각이다. 주제:${topic}. 초점:${level.focus}. 이미 저장된 단어는 절대 다시 만들지 마. 다음 목록과 철자/대소문자/띠어쓰기만 다른 단어도 제외해:${existing}. 모든 항목은 자연스러운 영어 예문 example을 정확히 1개씩 반드시 포함해야 한다. 형식:{"words":[{"word":"영어 표현","meaning":"한국어 뜻","example":"짧은 말하기 예문 1개","tag":"${level.grade} ${level.label}","note":"어떤 답변에서 쓰면 좋은지"}]}`;
  try {
    setAiStatus(`${level.grade} 단어장을 만드는 중...`, "loading");
    const data = await callAiJson(prompt);
    const words = Array.isArray(data.words) ? data.words : [];
    const withExamples = words.filter((word) => word?.word && word?.meaning && word?.example);
    const uniqueWords = withExamples.filter((word) => !existingWords.some((existingWord) => wordKey(existingWord) === wordKey(word.word)));
    if (!uniqueWords.length) throw new Error("새로 추가할 단어가 없어요. 이미 있는 단어와 겹치거나 예문이 빠졌습니다.");
    const result = await addWords(uniqueWords, { updateExisting: false });
    renderAiPreview(uniqueWords, `${uniqueWords.length}개 생성 · 새 단어 ${result.added}개`);
    setAiStatus(result.duplicate ? `단어장을 저장했어요. 중복 ${result.duplicate}개는 제외했습니다.` : "단어장을 저장했어요.", "success");
  } catch (error) {
    setAiStatus(aiErrorMessage(error), "warning");
  }
}

function renderAiPreview(words, label) {
  el.aiPreview.innerHTML = "";
  const title = document.createElement("p");
  title.className = "preview-title";
  title.textContent = label;
  el.aiPreview.append(title);
  words.slice(0, 8).forEach((word) => {
    const row = document.createElement("div");
    row.className = "preview-item";
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = word.word;
    span.textContent = word.meaning || word.tag || "";
    row.append(strong, span);
    el.aiPreview.append(row);
  });
}

function speakCurrentWord() {
  const word = state.words.find((item) => item.id === currentCard?.wordId);
  if (!word || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word.word);
  utterance.lang = "en-US";
  speechSynthesis.speak(utterance);
}

function bindEvents() {
  el.tabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  el.startStudyButton.addEventListener("click", () => switchView("study"));
  el.showAnswerButton.addEventListener("click", () => { if (el.answerInput) el.answerInput.disabled = true; el.answerPanel.hidden = false; setAnswerButtons(true); });
  el.answerInput?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); el.showAnswerButton.click(); } });
  el.correctButton.addEventListener("click", () => answerCurrent("correct"));
  el.wrongButton.addEventListener("click", () => answerCurrent("wrong"));
  el.unknownButton.addEventListener("click", () => answerCurrent("unknown"));
  el.speakButton.addEventListener("click", speakCurrentWord);
  el.wordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addWords([{ word: el.wordInput.value, meaning: el.meaningInput.value, example: el.exampleInput.value }]);
    el.wordForm.reset();
  });
  el.searchInput.addEventListener("input", renderWords);
  el.weakFilter?.addEventListener("change", renderWords);
  el.bulkAddButton?.addEventListener("click", async () => {
    const entries = parseBulkWords(el.bulkInput.value);
    if (!entries.length) { el.bulkStatus.textContent = "?? - ? ???? ? ?? ??? ???? ???."; return; }
    const result = await addWords(entries);
    el.bulkInput.value = "";
    el.bulkStatus.textContent = `?? ${result.added}?, ?? ${result.duplicate}?, ?? ${result.invalid}?`;
  });
  el.seedButton.addEventListener("click", () => addWords(sampleWords));
  el.exportDeckButton.addEventListener("click", exportDeck);
  el.importDeckInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importDeck(file);
    event.target.value = "";
  });
  el.saveAiButton.addEventListener("click", async () => { await saveAiSettings(); renderLevel(); setAiStatus("AI 설정을 저장했어요.", "success"); });
  el.generateDeckButton.addEventListener("click", generateDeck);
  el.aiProvider.addEventListener("change", () => {
    if (!el.aiModel.value || ["gemini-3.5-flash", "gpt-4.1-mini"].includes(el.aiModel.value)) el.aiModel.value = el.aiProvider.value === "openai" ? "gpt-4.1-mini" : "gemini-3.5-flash";
  });
  el.targetLevel.addEventListener("change", async () => { state.profile.targetLevel = el.targetLevel.value; await saveState(); renderLevel(); });
}

function registerPwa() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredPrompt = event; el.installButton.hidden = false; });
  el.installButton.addEventListener("click", async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; el.installButton.hidden = true; });
}

async function init() {
  db = await openDb();
  state = await loadState();
  bindEvents();
  registerPwa();
  renderAll();
}

init().catch((error) => {
  console.error(error);
  alert("앱을 시작하지 못했어요. 브라우저 저장소 권한을 확인해 주세요.");
});
