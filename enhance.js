(function () {
  const STORAGE_KEYS = ["vocab-routine-state-v2", "vocab-routine-state-v1"];
  const UNKNOWN = "모르겠다";

  const $ = (selector) => document.querySelector(selector);
  const els = {
    status: $("#aiStatus"),
    preview: $("#aiPreview"),
    apiProvider: $("#aiProvider"),
    apiKey: $("#aiApiKey"),
    aiModel: $("#aiModel"),
    goal: $("#aiGoal"),
    profileLevel: $("#profileLevel"),
    profileWeaknesses: $("#profileWeaknesses"),
    weakWordCount: $("#weakWordCount"),
    generateWeakWordsButton: $("#generateWeakWordsButton"),
    enrichWordsButton: $("#enrichWordsButton"),
    generateReviewSetButton: $("#generateReviewSetButton"),
    explainWordButton: $("#explainWordButton"),
    showAnswerButton: $("#showAnswerButton"),
    answerPanel: $("#answerPanel"),
    studyInsight: $("#studyInsight"),
    answerExample: $("#answerExample"),
    quizWord: $("#quizWord"),
  };

  function storageKey() {
    return STORAGE_KEYS.find((key) => localStorage.getItem(key)) || STORAGE_KEYS[0];
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || "{}");
    } catch {
      return {};
    }
  }

  function saveState(state) {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  }

  function words(state) {
    return Array.isArray(state.words) ? state.words : [];
  }

  function aiSettings(state) {
    const ai = state.settings?.ai || {};
    return {
      provider: els.apiProvider?.value || ai.provider || "gemini",
      apiKey: els.apiKey?.value?.trim() || ai.apiKey || "",
      model: els.aiModel?.value?.trim() || ai.model || "gemini-3.5-flash",
    };
  }

  function setStatus(message, tone = "") {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.className = `result ${tone}`.trim();
  }

  function explainError(error) {
    const message = String(error?.message || error || "");
    const lower = message.toLowerCase();
    if (lower.includes("quota") || lower.includes("rate")) return "AI 한도에 걸렸어요. 잠시 뒤 다시 시도하거나 다른 키/모델을 사용해 주세요.";
    if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("forbidden")) return "API 키 권한을 확인해 주세요.";
    if (lower.includes("abort") || lower.includes("20초")) return "AI 응답이 20초를 넘겨서 중단했어요.";
    return message || "AI 호출에 실패했어요.";
  }

  function createTimeout(ms = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

  async function callAiJson(prompt) {
    const state = loadState();
    const { provider, apiKey, model } = aiSettings(state);
    if (provider === "none") throw new Error("AI 제공자가 꺼져 있어요.");
    if (!apiKey) throw new Error("API 키를 먼저 입력해 주세요.");

    const wrapped = `${prompt}\n\n중요: 설명 없이 유효한 JSON 객체만 반환해.`;

    if (provider === "gemini") {
      const { controller, timer } = createTimeout();
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
      } finally {
        clearTimeout(timer);
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Gemini 호출에 실패했어요.");
      return parseJson(data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || "");
    }

    if (provider === "openai") {
      const { controller, timer } = createTimeout();
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
      } finally {
        clearTimeout(timer);
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "OpenAI 호출에 실패했어요.");
      return parseJson(data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n") || "");
    }

    throw new Error("지원하지 않는 AI 제공자예요.");
  }

  function parseJson(text) {
    const trimmed = String(text || "").trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI 응답에서 JSON을 찾지 못했어요.");
      return JSON.parse(match[0]);
    }
  }

  function normalizeWord(entry) {
    if (!entry?.word || !entry?.meaning) return null;
    return {
      id: entry.id || crypto?.randomUUID?.() || `word-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      word: String(entry.word).trim(),
      meaning: String(entry.meaning).trim(),
      example: String(entry.example || "").trim(),
      tag: String(entry.tag || "AI 추천").trim(),
      note: String(entry.note || "").trim(),
      synonyms: Array.isArray(entry.synonyms) ? entry.synonyms.map(String).slice(0, 5) : [],
      mastery: Number(entry.mastery || 0),
      correctCount: Number(entry.correctCount || 0),
      wrongCount: Number(entry.wrongCount || 0),
      lastStudiedAt: entry.lastStudiedAt || "",
      nextReviewAt: entry.nextReviewAt || new Date().toISOString().slice(0, 10),
      createdAt: entry.createdAt || new Date().toISOString(),
    };
  }

  function weakWords(list, limit = 10) {
    return [...list]
      .filter((word) => Number(word.wrongCount || 0) > 0 || Number(word.mastery || 0) < 2)
      .sort((a, b) => Number(b.wrongCount || 0) - Number(a.wrongCount || 0) || Number(a.mastery || 0) - Number(b.mastery || 0))
      .slice(0, limit);
  }

  function mergeWords(newWords) {
    const state = loadState();
    state.words = words(state);
    let added = 0;
    newWords.map(normalizeWord).filter(Boolean).forEach((word) => {
      const existing = state.words.find((item) => item.word.toLowerCase() === word.word.toLowerCase());
      if (existing) Object.assign(existing, { ...existing, ...word, id: existing.id, createdAt: existing.createdAt });
      else { state.words.push(word); added += 1; }
    });
    saveState(state);
    return { added, total: newWords.length };
  }

  function renderPreview(items, label) {
    if (!els.preview) return;
    els.preview.innerHTML = "";
    const title = document.createElement("p");
    title.className = "preview-title";
    title.textContent = label;
    els.preview.append(title);
    items.slice(0, 12).forEach((item) => {
      const row = document.createElement("div");
      row.className = "preview-item";
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = item.word || item.sentence || item.question || "복습";
      span.textContent = item.meaning || item.tag || item.answer || "";
      row.append(strong, span);
      els.preview.append(row);
    });
  }

  function refreshSoon() {
    setTimeout(() => window.location.reload(), 900);
  }

  function profileSummary() {
    const state = loadState();
    const profile = state.profile || {};
    const weak = weakWords(words(state), 99);
    if (els.profileLevel) els.profileLevel.textContent = profile.level || "미진단";
    if (els.profileWeaknesses) els.profileWeaknesses.textContent = Array.isArray(profile.weaknesses) && profile.weaknesses.length ? profile.weaknesses.join(", ") : "없음";
    if (els.weakWordCount) els.weakWordCount.textContent = String(weak.length);
  }

  async function generateWeakWords() {
    try {
      const state = loadState();
      const weak = weakWords(words(state), 10);
      if (!weak.length) throw new Error("오답 데이터가 아직 부족해요. 먼저 몇 문제를 풀어보세요.");
      setStatus("오답 기반 보강 단어를 만드는 중...", "loading");
      const prompt = `다음 오답/약한 단어를 바탕으로 헷갈리기 쉬운 보강 단어 12개를 JSON으로만 만들어줘. 목표:${state.profile?.goal || "수능"}. 레벨:${state.profile?.level || "미진단"}. 약점:${(state.profile?.weaknesses || []).join(", ") || "없음"}. 약한 단어:${JSON.stringify(weak.map((word) => ({ word: word.word, meaning: word.meaning, wrongCount: word.wrongCount, mastery: word.mastery })))}. 형식:{"words":[{"word":"영어","meaning":"한국어","example":"짧은 영어 예문","tag":"오답 보강","note":"학습 팁","synonyms":["유의어"]}]}`;
      const data = await callAiJson(prompt);
      const generated = Array.isArray(data.words) ? data.words : [];
      if (!generated.length) throw new Error("보강 단어가 비어 있어요.");
      const result = mergeWords(generated);
      renderPreview(generated, `오답 보강 ${generated.length}개 · 새 단어 ${result.added}개`);
      setStatus("저장했어요. 단어장을 새로고침합니다.", "success");
      refreshSoon();
    } catch (error) {
      setStatus(explainError(error), "warning");
    }
  }

  async function enrichWords() {
    try {
      const state = loadState();
      const targets = words(state).filter((word) => !word.example || !word.note).slice(0, 8);
      if (!targets.length) throw new Error("보강할 단어가 없어요. 예문과 메모가 이미 채워져 있습니다.");
      setStatus("예문/메모를 보강하는 중...", "loading");
      const prompt = `다음 단어들의 예문, 태그, 짧은 한국어 메모를 보강해줘. JSON만 반환해. 단어:${JSON.stringify(targets.map((word) => ({ word: word.word, meaning: word.meaning, example: word.example, tag: word.tag })))}. 형식:{"words":[{"word":"기존 단어","meaning":"뜻","example":"짧은 영어 예문","tag":"태그","note":"한국어 학습 메모","synonyms":["유의어"]}]}`;
      const data = await callAiJson(prompt);
      const enriched = Array.isArray(data.words) ? data.words : [];
      if (!enriched.length) throw new Error("보강 결과가 비어 있어요.");
      const result = mergeWords(enriched);
      renderPreview(enriched, `보강 완료 ${enriched.length}개`);
      setStatus(`보강을 저장했어요. 새 단어 ${result.added}개, 기존 단어 업데이트 포함.`, "success");
      refreshSoon();
    } catch (error) {
      setStatus(explainError(error), "warning");
    }
  }

  async function generateReviewSet() {
    try {
      const state = loadState();
      const today = new Date().toISOString().slice(0, 10);
      const due = words(state).filter((word) => !word.nextReviewAt || word.nextReviewAt <= today).slice(0, 8);
      if (!due.length) throw new Error("오늘 복습할 단어가 없어요.");
      setStatus("오늘 단어로 복습 문장을 만드는 중...", "loading");
      const prompt = `다음 단어를 모두 활용해 짧은 복습 문장 5개와 빈칸 문제 3개를 JSON으로만 만들어줘. 단어:${JSON.stringify(due.map((word) => word.word))}. 형식:{"review":[{"sentence":"영어 문장","meaning":"한국어 해석"}],"cloze":[{"question":"빈칸 문제","answer":"정답"}]}`;
      const data = await callAiJson(prompt);
      const items = [...(Array.isArray(data.review) ? data.review : []), ...(Array.isArray(data.cloze) ? data.cloze : [])];
      if (!items.length) throw new Error("복습 문장이 비어 있어요.");
      renderPreview(items, "오늘 복습 문장");
      setStatus("복습 문장을 만들었어요.", "success");
    } catch (error) {
      setStatus(explainError(error), "warning");
    }
  }

  async function explainCurrentWord() {
    try {
      const state = loadState();
      const text = els.quizWord?.textContent?.trim();
      const word = words(state).find((item) => item.word === text);
      if (!word) throw new Error("현재 단어를 찾지 못했어요.");
      if (els.studyInsight) {
        els.studyInsight.hidden = false;
        els.studyInsight.textContent = "AI 해설을 만드는 중...";
      }
      const prompt = `영어 단어 ${word.word}(${word.meaning})를 한국인 학습자에게 짧게 설명해줘. JSON만 반환해. 형식:{"note":"헷갈림 포인트와 기억법 1문장","example":"새 영어 예문","synonyms":["유의어1","유의어2"]}`;
      const data = await callAiJson(prompt);
      word.note = data.note || word.note;
      word.example = data.example || word.example;
      word.synonyms = Array.isArray(data.synonyms) ? data.synonyms.slice(0, 5) : word.synonyms;
      saveState(state);
      if (els.studyInsight) els.studyInsight.textContent = word.note || "저장할 해설이 없어요.";
      if (els.answerExample && word.example) els.answerExample.textContent = word.example;
    } catch (error) {
      if (els.studyInsight) {
        els.studyInsight.hidden = false;
        els.studyInsight.textContent = explainError(error);
      }
    }
  }

  function bind() {
    els.generateWeakWordsButton?.addEventListener("click", generateWeakWords);
    els.enrichWordsButton?.addEventListener("click", enrichWords);
    els.generateReviewSetButton?.addEventListener("click", generateReviewSet);
    els.explainWordButton?.addEventListener("click", explainCurrentWord);
    els.showAnswerButton?.addEventListener("click", () => {
      if (els.explainWordButton) els.explainWordButton.hidden = false;
    });
    profileSummary();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
