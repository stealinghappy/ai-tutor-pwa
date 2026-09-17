/*
 * AI 家教遊戲系統 - 家長介面
 * 讀 /api/players、/api/evaluation、/api/vouchers 三個唯讀 API 呈現。
 * AI 目標達成評估報告（db/ai_evaluation.json）目前是由 Claude/agy 離線產生後寫入，
 * 這支程式只負責顯示，不含任何評估邏輯。
 */
(function () {
  const SUBJECT_LABEL = { english: "英文", math: "數學", chinese: "國文" };
  const GRADE_LABEL = { junior: "國一", senior: "高三" };

  async function load() {
    const [players, evaluation, vouchers] = await Promise.all([
      fetch("/api/players").then((r) => r.json()).catch(() => ({})),
      fetch("/api/evaluation").then((r) => r.json()).catch(() => ({})),
      fetch("/api/vouchers").then((r) => r.json()).catch(() => []),
    ]);
    renderPlayers(players, evaluation);
    renderVouchers(vouchers);
  }

  function renderPlayers(players, evaluation) {
    const root = document.getElementById("players");
    root.innerHTML = "";
    const ids = Object.keys(players || {});
    if (!ids.length) {
      root.innerHTML = "<div class='empty'>目前還沒有玩家資料，先讓孩子開始玩遊戲吧。</div>";
      return;
    }

    ids.forEach((pid) => {
      const p = players[pid];
      const card = document.createElement("div");
      card.className = "player-card";

      const rows = Object.entries(p.progress || {})
        .map(([subject, prog]) => {
          return `<tr>
            <td>${SUBJECT_LABEL[subject] || subject}</td>
            <td>${prog.defeated_count || 0}</td>
            <td>${prog.difficulty || 1} ⭐</td>
            <td>${prog.heal_items || 0}</td>
          </tr>`;
        })
        .join("");

      const evalEntry = evaluation && evaluation[pid];
      const evalText = evalEntry
        ? evalEntry.report || JSON.stringify(evalEntry)
        : "（尚無 AI 評估報告，之後由 Claude/agy 定期產生後會顯示在這裡）";

      card.innerHTML = `
        <h3>${GRADE_LABEL[p.grade] || p.grade || pid}（${pid}）</h3>
        <div>💰 金幣：${p.coins || 0}</div>
        <table>
          <thead><tr><th>科目</th><th>擊敗怪獸數</th><th>目前難度</th><th>補血道具</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='4' class='empty'>還沒有紀錄</td></tr>"}</tbody>
        </table>
        <div class="eval-box">🤖 AI 目標達成評估：<br/>${evalText}</div>
      `;
      root.appendChild(card);
    });
  }

  function renderVouchers(vouchers) {
    const root = document.getElementById("vouchers");
    if (!vouchers || !vouchers.length) {
      root.innerHTML = "<div class='empty'>目前沒有兌換憑證。</div>";
      return;
    }
    root.innerHTML = vouchers
      .map(
        (v) =>
          `<div class="voucher-item">${GRADE_LABEL[v.player_id] || v.player_id} - ${
            SUBJECT_LABEL[v.subject] || v.subject
          } - 累積擊敗 ${v.milestone} 隻 - ${v.redeemed ? "已兌換" : "待家長確認"}</div>`
      )
      .join("");
  }

  load();
})();
