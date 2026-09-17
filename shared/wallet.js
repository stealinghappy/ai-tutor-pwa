/*
 * AI 家教遊戲系統 - 金幣系統
 * 每個學生一個錢包，英文/數學/國文三科共用（不再各科獨立）。
 */
(function (global) {
  const NS = (global.AITutor = global.AITutor || {});

  const COIN_RULES = {
    correct: 10,
    comboBonus: 30, // 連續答對 3 題的額外獎勵（保留給之後擴充連擊判定用）
    defeatMonsterMin: 50,
    defeatMonsterMax: 200,
    firstClearBonus: 100,
    wrong: -5,
  };

  function addCoins(player, amount) {
    player.coins = Math.max(0, (player.coins || 0) + amount);
    return player.coins;
  }

  // 難度 1~5 線性對應 50~200 金幣獎勵
  function defeatReward(difficulty) {
    const d = Math.max(1, Math.min(5, difficulty || 1));
    const min = COIN_RULES.defeatMonsterMin;
    const max = COIN_RULES.defeatMonsterMax;
    return Math.round(min + ((max - min) * (d - 1)) / 4);
  }

  NS.Wallet = { COIN_RULES, addCoins, defeatReward };
})(window);
