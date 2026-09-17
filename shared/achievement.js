/*
 * AI 家教遊戲系統 - 成就/兌換憑證
 * 累積擊敗怪獸數達到里程碑時發一張兌換憑證，家長介面確認後才換現實獎金。
 * 門檻先給合理預設值，之後可在家長介面調整。
 */
(function (global) {
  const NS = (global.AITutor = global.AITutor || {});

  const MILESTONES = [5, 15, 30, 50];

  async function checkAndIssueVoucher(playerId, subject, defeatedCount) {
    if (!MILESTONES.includes(defeatedCount)) return null;
    const voucher = {
      player_id: playerId,
      subject,
      milestone: defeatedCount,
      issued_at: new Date().toISOString(),
      redeemed: false,
    };
    try {
      await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voucher),
      });
    } catch (e) {
      console.warn("兌換憑證寫入失敗（伺服器可能離線）", e);
    }
    return voucher;
  }

  NS.Achievement = { MILESTONES, checkAndIssueVoucher };
})(window);
