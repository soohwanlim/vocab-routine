(function () {
  const LEVELS = [
    { grade: "9급", label: "입문", opic: "NH~IL", toeic: "Novice High", focus: "일상 기본 명사, 쉬운 동사, 짧은 답변", count: 15 },
    { grade: "8급", label: "기초", opic: "IL~IM1", toeic: "Intermediate Low", focus: "취미, 가족, 장소 묘사, 빈도 표현", count: 18 },
    { grade: "7급", label: "초중급", opic: "IM1", toeic: "Intermediate Low~Mid", focus: "경험 설명, 이유 말하기, 연결어", count: 20 },
    { grade: "6급", label: "중급", opic: "IM2", toeic: "Intermediate Mid", focus: "문제 상황, 비교, 과거 경험 설명", count: 22 },
    { grade: "5급", label: "중상급", opic: "IM3", toeic: "Intermediate High", focus: "구체적 묘사, 감정/의견, 상황별 표현", count: 24 },
    { grade: "4급", label: "실전", opic: "IH", toeic: "Intermediate High~Advanced Low", focus: "논리 전개, 해결책 제시, 자연스러운 부사구", count: 26 },
    { grade: "3급", label: "고급", opic: "AL", toeic: "Advanced Low", focus: "추상 주제, 사회 이슈, 뉘앙스 있는 표현", count: 28 },
    { grade: "2급", label: "심화", opic: "AL 이상 목표", toeic: "Advanced Mid", focus: "정교한 의견, 설득, 비즈니스/뉴스 어휘", count: 30 },
    { grade: "1급", label: "자유 운용", opic: "AL 안정권", toeic: "Advanced High", focus: "원어민식 콜로케이션, 관용 표현, 즉흥 답변", count: 30 },
  ];

  const STORAGE_KEYS = ["vocab-routine-state-v2", "vocab-routine-state-v1"];
  const $ = (selector) => document.querySelector(selector);

  function storageKey() {
    return STORAGE_KEYS.find((key) => localStorage.getItem(key)) || STORAGE_KEYS[0];
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(storageKey()) || "{}"); }
    catch { return {}; }
  }

  function saveState(state) {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  }

  function getSettings(state) {
    return state.settings?.ai || {};
  }

  function selectedLevel() {
    const value = $("#targetSpeakingLevel")?.value || "6급";
    return LEVELS.find((level) => level.grade === value) || LEVELS[3];
  }

  function currentWords(state) {
    return Array.isArray(state.words) ? state.words : [];
  }

  function currentWeaknesses(state) {
    return Array.isArray(state.profile?.weaknesses) ? state.profile.weaknesses : [];
  }

  function setStatus(message, tone = "") {
    const status = $("#aiStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `result ${tone}`.trim();
  }

  function explainError(error) {
    const message = String(error?.message || error || "");
    const lower = message.toLowerCase();
    if (lower.includes("quota") || lower.includes("rate")) return "AI 한도에 걸렸어요. 잠시 뒤 다시 시도하거나 다른 키/모델을 사용해 주세요.";
    if (lower.includes("api key") || lower.includes("forbidden") || lower.includes("unauthorized")) return "API 키 권한을 확인해 주세요.";
    if (lower.includes("abort") || lower.includes("20초")) return "AI 응답이 20초를 넘겨서 중단했어요.";
    return message || "AI 호출에 실패했어요.";
  }

  function timeout(ms = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

  async function callAiJson(prompt) {
    const state = loadState();
    const settings = getSettings(state);
    const provider = $("#aiProvider")?.value || settings.provider || "gemini";
    const apiKey = $("#aiApiKey")?.value?.trim() || settings.apiKey || "";
    const model = $("#aiModel")?.value?.trim() || settings.model || "gemini-3.5-flash";
    if (provider === "none") throw new Error("AI 제공자가 꺼져 있어요.");
    if (!apiKey) throw new Error("API 키를 먼저 입력해 주세요.");

    const wrapped = `${prompt}\n\n중요: 설명 없이 유효한 JSON 객체만 반환해.`;
    if (provider === "gemini") {
      const { controller, timer } = timeout();
      let response;
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: wrapped }] }], generationConfig: { response_mime_type: "application/json" } }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error.name === "AbortError") throw new Error("AI 응답이 20초를 넘겼어요.");
        throw error;
      } finally { clearTimeout(timer); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Gemini 호출에 실패했어요.");
      return parseJson(data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || "");
    }

    const { controller, timer } = timeout();
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: wrapped }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") throw new Error("AI 응답이 20초를 넘겼어요.");
      throw error;
    } finally { clearTimeout(timer); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI 호출에 실패했어요.");
    return parseJson(data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n") || "");
  }

  function parseJson(text) {
    const trimmed = String(text || "").trim();
    try { return JSON.parse(trimmed); }
    catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI 응답에서 JSON을 찾지 못했어요.");
      return JSON.parse(match[0]);
    }
  }

  function normalizeWord(entry, level) {
    if (!entry?.word || !entry?.meaning) return null;
    return {
      id: entry.id || crypto?.randomUUID?.() || `word-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      word: String(entry.word).trim(),
      meaning: String(entry.meaning).trim(),
      example: String(entry.example || "").trim(),
      tag: String(entry.tag || `${level.grade} ${level.label}`).trim(),
      note: String(entry.note || `${level.opic} / ${level.toeic} 목표 표현`).trim(),
      speakingLevel: level.grade,
      mastery: 0,
      correctCount: 0,
      wrongCount: 0,
      lastStudiedAt: "",
      nextReviewAt: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
  }

  function addWords(generated, level) {
    const state = loadState();
    state.words = currentWords(state);
    let added = 0;
    generated.map((word) => normalizeWord(word, level)).filter(Boolean).forEach((word) => {
      const existing = state.words.find((item) => item.word.toLowerCase() === word.word.toLowerCase());
      if (existing) Object.assign(existing, { ...existing, ...word, id: existing.id, createdAt: existing.createdAt });
      else { state.words.push(word); added += 1; }
    });
    state.profile = state.profile || {};
    state.profile.speakingLevel = level.grade;
    state.profile.speakingLabel = level.label;
    state.profile.speakingOpic = level.opic;
    state.profile.speakingToeic = level.toeic;
    saveState(state);
    return added;
  }

  function renderPreview(words, label) {
    const preview = $("#aiPreview");
    if (!preview) return;
    preview.innerHTML = "";
    const title = document.createElement("p");
    title.className = "preview-title";
    title.textContent = label;
    preview.append(title);
    words.slice(0, 12).forEach((word) => {
      const row = document.createElement("div");
      row.className = "preview-item";
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = word.word;
      span.textContent = `${word.meaning || ""} · ${word.tag || ""}`;
      row.append(strong, span);
      preview.append(row);
    });
  }

  function levelPrompt(level) {
    const state = loadState();
    const goal = $("#aiGoal")?.value || state.profile?.goal || "회화";
    const topic = $("#aiTopic")?.value?.trim() || "일상 회화";
    const existing = currentWords(state).map((word) => word.word).slice(-120).join(", ");
    return `한국인 영어 말하기 학습자를 위한 ${level.grade}(${level.label}) 단어장 ${level.count}개를 JSON으로만 만들어줘. 이 앱의 ${level.grade}는 OPIc ${level.opic}, TOEIC Speaking ${level.toeic} 정도를 목표로 하는 학습용 기준이다. 목표:${goal}. 주제:${topic}. 레벨 초점:${level.focus}. 사용자 약점:${currentWeaknesses(state).join(", ") || "없음"}. 이미 저장된 단어는 피하기:${existing}. 단어는 말하기 답변에 바로 쓰기 좋은 동사, 형용사, 연결 표현, 상황 표현 중심으로 골라줘. 형식:{"words":[{"word":"영어 표현","meaning":"한국어 뜻","example":"짧은 말하기 예문","tag":"${level.grade} ${level.label}","note":"어떤 답변에서 쓰면 좋은지"}]}`;
  }

  async function generateLevelWords() {
    const level = selectedLevel();
    try {
      setStatus(`${level.grade} ${level.label} 단어장을 만드는 중...`, "loading");
      const data = await callAiJson(levelPrompt(level));
      const generated = Array.isArray(data.words) ? data.words : [];
      if (!generated.length) throw new Error("생성된 단어가 비어 있어요.");
      const added = addWords(generated, level);
      renderPreview(generated, `${level.grade} ${level.label} 단어 ${generated.length}개 · 새 단어 ${added}개`);
      setStatus(`${level.grade} 단어장을 저장했어요. 새로고침하면 학습에 반영됩니다.`, "success");
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setStatus(explainError(error), "warning");
    }
  }

  function estimateGradeFromProfile(profile = {}) {
    const raw = `${profile.speakingLevel || ""} ${profile.level || ""}`.toUpperCase();
    if (raw.includes("AL") || raw.includes("C1")) return "3급";
    if (raw.includes("IH") || raw.includes("B2")) return "4급";
    if (raw.includes("IM3")) return "5급";
    if (raw.includes("IM2") || raw.includes("B1")) return "6급";
    if (raw.includes("IM1")) return "7급";
    if (raw.includes("IL") || raw.includes("A2")) return "8급";
    return "9급";
  }

  function renderLevelSystem() {
    const root = $("#levelSystemMount");
    if (!root) return;
    const state = loadState();
    const currentGrade = state.profile?.speakingLevel || estimateGradeFromProfile(state.profile);
    root.innerHTML = "";

    const controls = document.createElement("div");
    controls.className = "level-controls";
    const label = document.createElement("label");
    label.textContent = "목표 말하기 레벨";
    const select = document.createElement("select");
    select.id = "targetSpeakingLevel";
    LEVELS.forEach((level) => {
      const option = document.createElement("option");
      option.value = level.grade;
      option.textContent = `${level.grade} ${level.label} · OPIc ${level.opic} · TS ${level.toeic}`;
      option.selected = level.grade === currentGrade;
      select.append(option);
    });
    label.append(select);
    const button = document.createElement("button");
    button.className = "primary";
    button.type = "button";
    button.textContent = "선택 레벨 단어장 생성";
    button.addEventListener("click", generateLevelWords);
    controls.append(label, button);

    const guide = document.createElement("div");
    guide.className = "level-ladder";
    LEVELS.forEach((level) => {
      const item = document.createElement("article");
      item.className = level.grade === currentGrade ? "is-current" : "";
      item.innerHTML = `<strong>${level.grade} ${level.label}</strong><span>OPIc ${level.opic} · TOEIC Speaking ${level.toeic}</span><p>${level.focus}</p>`;
      guide.append(item);
    });

    const note = document.createElement("p");
    note.className = "helper level-note";
    note.textContent = "이 표는 학습용 기준이며 OPIc/TOEIC Speaking 공식 환산표가 아닙니다. 목표 단어장 난이도를 잡기 위한 기준으로 사용하세요.";
    root.append(controls, guide, note);
  }

  function updateProfileCards() {
    const state = loadState();
    const profile = state.profile || {};
    const level = LEVELS.find((item) => item.grade === (profile.speakingLevel || estimateGradeFromProfile(profile)));
    const levelEl = $("#profileLevel");
    if (levelEl && level) levelEl.textContent = `${level.grade} ${level.label} · OPIc ${level.opic}`;
  }

  function bind() {
    renderLevelSystem();
    updateProfileCards();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
