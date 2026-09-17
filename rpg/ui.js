/*
 * AI 家教遊戲系統 - 戰鬥畫面 UI 元件
 * 純畫面渲染，不含戰鬥規則（規則在 battle.js）。
 */
(function (global) {
  const NS = (global.AITutor = global.AITutor || {});

  const SUBJECT_LABEL = { english: "英文", math: "數學", chinese: "國文" };
  const GRADE_LABEL = { junior: "國一", senior: "高三" };

  function renderPlayerHP(el, hp, maxHp) {
    el.innerHTML = "";
    for (let i = 0; i < maxHp; i++) {
      const heart = document.createElement("span");
      heart.className = "hp-heart";
      heart.textContent = i < hp ? "❤" : "🖤";
      el.appendChild(heart);
    }
  }

  function renderMonsterHP(el, hp, maxHp) {
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    el.innerHTML =
      `<div class="hp-bar-outer"><div class="hp-bar-inner" style="width:${pct}%"></div></div>` +
      `<div class="hp-bar-text">${hp} / ${maxHp}</div>`;
  }

  function renderCoins(el, coins) {
    el.textContent = `💰 ${coins}`;
  }

  function renderHealItems(el, count, onUse) {
    el.innerHTML = "";
    const label = document.createElement("span");
    label.textContent = `🧪 補血道具 x${count}`;
    el.appendChild(label);

    const btn = document.createElement("button");
    btn.textContent = "使用";
    btn.disabled = count <= 0;
    btn.className = "heal-use-btn";
    btn.onclick = onUse;
    el.appendChild(btn);
  }

  function renderQuestion(container, question, onChoose) {
    container.innerHTML = "";

    const qEl = document.createElement("div");
    qEl.className = "question-text";
    qEl.textContent = question.question;
    container.appendChild(qEl);

    const choicesEl = document.createElement("div");
    choicesEl.className = "choices";
    question.choices.forEach((choice, idx) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = `${String.fromCharCode(65 + idx)}. ${choice}`;
      btn.onclick = () => onChoose(idx);
      choicesEl.appendChild(btn);
    });
    container.appendChild(choicesEl);

    if (question.diagram) {
      const note = document.createElement("div");
      note.className = "diagram-note";
      note.textContent = "（本題含圖，圖片由 AGY 生成後會顯示在這裡）";
      container.appendChild(note);
    }

    if (question.hint) {
      const hintBtn = document.createElement("button");
      hintBtn.className = "hint-btn";
      hintBtn.textContent = "💡 提示";
      hintBtn.onclick = () => alert(question.hint);
      container.appendChild(hintBtn);
    }

    if (question.pronunciation && question.pronunciation.voice_file) {
      const speakBtn = document.createElement("button");
      speakBtn.className = "hint-btn";
      speakBtn.textContent = "🔊 發音";
      speakBtn.onclick = () => NS.Audio.speakWord(question.pronunciation.voice_file);
      container.appendChild(speakBtn);
    }
  }

  function flashFeedback(el, correct) {
    el.textContent = correct ? "✅ 答對了！" : "❌ 答錯了";
    el.className = "feedback " + (correct ? "correct" : "wrong");
    el.style.opacity = "1";
    setTimeout(() => {
      el.style.opacity = "0";
    }, 900);
  }

  NS.UI = {
    SUBJECT_LABEL,
    GRADE_LABEL,
    renderPlayerHP,
    renderMonsterHP,
    renderCoins,
    renderHealItems,
    renderQuestion,
    flashFeedback,
  };
})(window);
