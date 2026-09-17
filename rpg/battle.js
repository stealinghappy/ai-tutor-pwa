/*
 * AI 家教遊戲系統 - 統一打怪 RPG 戰鬥邏輯
 * 英文／數學／國文三科共用同一套規則，只有題目內容與怪獸角色不同。
 *
 * 規則（對應 AI_TUTOR_DESIGN.md）：
 * - 怪獸 HP = 10，對應一包 10 題；答對一題 -> 怪獸 HP -1。
 * - 玩家預設 5 條命；答錯一題 -> 玩家 HP -1。
 * - 連續答對 2 題 -> 掉一個補血道具，之後任意時機可用，恢復玩家 1 點 HP。
 * - 10 題出完但怪獸沒死，或玩家 HP 歸零 -> 這隻怪獸整場重來（雙方 HP 重置、重新抓一次題包）。
 * - 怪獸死亡 -> 換下一隻（怪獸清單裡的下一個，到底就繞回第一隻）。
 */
(function (global) {
  const NS = (global.AITutor = global.AITutor || {});
  const { UI } = NS;

  const PLAYER_MAX_HP = 5;
  const MONSTER_MAX_HP = 10;
  const STREAK_FOR_HEAL_ITEM = 2;

  class BattleSession {
    /**
     * @param {object} opts
     * opts.playerId  "junior" | "senior"（目前兩個學生各自固定一個 id）
     * opts.grade     "junior" | "senior"
     * opts.subject   "english" | "math" | "chinese"
     * opts.els       畫面元素集合，見 index.html
     */
    constructor(opts) {
      this.playerId = opts.playerId;
      this.grade = opts.grade;
      this.subject = opts.subject;
      this.els = opts.els;
      this.spritePlayer = new NS.Animation.SpritePlayer(this.els.monsterStage);

      this.player = null;
      this.monsterList = [];
      this.monsterId = null;
      this.monsterMeta = null;
      this.pack = null;
      this.questionIndex = 0;
      this.consecutiveCorrect = 0;
      this.answering = false;
      this._baseUrl = null;
      this._frames = null;
    }

    async start() {
      const playersRes = await fetch("/api/players").then((r) => r.json());
      this.player = playersRes[this.playerId] || this._newPlayer();

      this.monsterList = await fetch(`/api/content-list/${this.grade}/${this.subject}`).then((r) =>
        r.json()
      );

      if (!this.monsterList || !this.monsterList.length) {
        this.els.questionArea.innerHTML =
          "<div class='empty-state'>這個科目還沒有題包，等 AGY 生成後再回來挑戰。</div>";
        return;
      }

      const prog = this._progress();
      this.monsterId =
        prog.current_monster_id && this.monsterList.includes(prog.current_monster_id)
          ? prog.current_monster_id
          : this.monsterList[0];

      await this._loadMonster({ resume: !!prog.current_monster_id });
      this._renderAll();
      this._askCurrentQuestion();
    }

    _newPlayer() {
      return { grade: this.grade, coins: 0, difficulty_level: 1, progress: {} };
    }

    _progress() {
      this.player.progress = this.player.progress || {};
      if (!this.player.progress[this.subject]) {
        this.player.progress[this.subject] = {
          current_monster_id: null,
          player_hp: PLAYER_MAX_HP,
          monster_hp: MONSTER_MAX_HP,
          heal_items: 0,
          question_index: 0,
          streak: 0,
          defeated_count: 0,
          difficulty: 1,
        };
      }
      return this.player.progress[this.subject];
    }

    async _loadMonster({ resume }) {
      this.monsterMeta = await fetch(`/api/monster/${this.subject}/${this.monsterId}`).then((r) =>
        r.ok ? r.json() : null
      );
      // AGY 每次重新生成的是題目，不是怪獸長相；每次重新抓一次，
      // 也讓「整場重來」時如果 AGY 已經離線更新過檔案，能拿到新題目。
      this.pack = await fetch(`/api/content/${this.grade}/${this.subject}/${this.monsterId}`).then((r) =>
        r.json()
      );

      const prog = this._progress();
      prog.current_monster_id = this.monsterId;
      if (!resume) {
        prog.player_hp = PLAYER_MAX_HP;
        prog.monster_hp = MONSTER_MAX_HP;
        prog.question_index = 0;
        prog.streak = 0;
      }
      this.questionIndex = prog.question_index || 0;
      this.consecutiveCorrect = 0;
      await this._persist();
    }

    async _persist() {
      try {
        await fetch(`/api/players/${this.playerId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.player),
        });
      } catch (e) {
        console.warn("進度儲存失敗（伺服器可能離線），先留在記憶體裡繼續玩", e);
      }
    }

    _renderAll() {
      const prog = this._progress();
      UI.renderPlayerHP(this.els.playerHpEl, prog.player_hp, PLAYER_MAX_HP);
      UI.renderMonsterHP(this.els.monsterHpEl, prog.monster_hp, MONSTER_MAX_HP);
      UI.renderCoins(this.els.coinsEl, this.player.coins || 0);
      UI.renderHealItems(this.els.healEl, prog.heal_items || 0, () => this._useHealItem());

      if (this.els.monsterNameEl) {
        this.els.monsterNameEl.textContent = this.monsterMeta
          ? this.monsterMeta.monster_name
          : this.monsterId;
      }

      // AITUTOR_ASSET_BASE：本機版預設 "/"（維持原行為），遠端版 pwa/index.html
      // 設成 "../"，因為 GitHub Pages 上這頁跟 assets/ 中間多隔一層 pwa/ 目錄。
      const assetBase = window.AITUTOR_ASSET_BASE !== undefined ? window.AITUTOR_ASSET_BASE : "/";
      const baseUrl = `${assetBase}assets/monsters/${this.subject}/${this.monsterId}`;
      const frames =
        (this.monsterMeta && this.monsterMeta.image_prompt && this.monsterMeta.image_prompt.frames) || {
          idle: 10,
          attack: 16,
          hurt: 8,
          defeat: 20,
        };
      this._baseUrl = baseUrl;
      this._frames = frames;
      this.spritePlayer.play(baseUrl, "idle", frames.idle, { loop: true });
    }

    _askCurrentQuestion() {
      if (this.questionIndex >= this.pack.questions.length) {
        return this._retryEncounter("怪獸還沒被打倒，重新挑戰！");
      }
      const q = this.pack.questions[this.questionIndex];
      UI.renderQuestion(this.els.questionArea, q, (choiceIdx) => this._onChoose(q, choiceIdx));
    }

    async _onChoose(question, choiceIdx) {
      if (this.answering) return;
      this.answering = true;

      const prog = this._progress();
      const correct = choiceIdx === question.answer;

      if (correct) {
        prog.monster_hp = Math.max(0, prog.monster_hp - 1);
        this.consecutiveCorrect += 1;
        NS.Wallet.addCoins(this.player, NS.Wallet.COIN_RULES.correct);
        NS.Audio.play("correct");
        this.spritePlayer.play(this._baseUrl, "hurt", this._frames.hurt, {
          onComplete: () => this.spritePlayer.play(this._baseUrl, "idle", this._frames.idle, { loop: true }),
        });
        if (this.consecutiveCorrect >= STREAK_FOR_HEAL_ITEM) {
          prog.heal_items = (prog.heal_items || 0) + 1;
          this.consecutiveCorrect = 0;
        }
      } else {
        prog.player_hp = Math.max(0, prog.player_hp - 1);
        this.consecutiveCorrect = 0;
        NS.Wallet.addCoins(this.player, NS.Wallet.COIN_RULES.wrong);
        NS.Audio.play("wrong");
        this.spritePlayer.play(this._baseUrl, "attack", this._frames.attack, {
          onComplete: () => this.spritePlayer.play(this._baseUrl, "idle", this._frames.idle, { loop: true }),
        });
      }

      UI.flashFeedback(this.els.feedbackEl, correct);
      this.questionIndex += 1;
      prog.question_index = this.questionIndex;
      this._renderAll();
      await this._persist();

      setTimeout(() => this._afterAnswer(), 700);
    }

    async _afterAnswer() {
      const prog = this._progress();

      if (prog.monster_hp <= 0) {
        return this._onDefeat();
      }
      if (prog.player_hp <= 0) {
        return this._retryEncounter("血量歸零了，重新挑戰這隻怪獸！");
      }
      this.answering = false;
      this._askCurrentQuestion();
    }

    async _onDefeat() {
      const prog = this._progress();
      NS.Audio.play("defeat");
      const reward = NS.Wallet.defeatReward(prog.difficulty || 1);
      NS.Wallet.addCoins(this.player, reward);
      prog.defeated_count = (prog.defeated_count || 0) + 1;

      this._renderAll();
      this.els.feedbackEl.textContent = `🏆 擊敗 ${
        this.monsterMeta ? this.monsterMeta.monster_name : this.monsterId
      }！+${reward} 金幣`;
      this.els.feedbackEl.className = "feedback correct";
      this.els.feedbackEl.style.opacity = "1";

      this.spritePlayer.play(this._baseUrl, "defeat", this._frames.defeat, {
        onComplete: () => this._advanceToNextMonster(),
      });

      await NS.Achievement.checkAndIssueVoucher(this.playerId, this.subject, prog.defeated_count);
      await this._persist();
    }

    async _advanceToNextMonster() {
      const idx = this.monsterList.indexOf(this.monsterId);
      const nextIdx = (idx + 1) % this.monsterList.length;
      this.monsterId = this.monsterList[nextIdx];
      await this._loadMonster({ resume: false });
      this.answering = false;
      this._renderAll();
      this._askCurrentQuestion();
    }

    async _retryEncounter(message) {
      const prog = this._progress();
      prog.player_hp = PLAYER_MAX_HP;
      prog.monster_hp = MONSTER_MAX_HP;
      prog.question_index = 0;
      prog.streak = 0;
      this.questionIndex = 0;
      this.consecutiveCorrect = 0;
      this.answering = false;

      // 若 AGY 已經在背景把這隻怪獸的題目檔換成新的一批，這裡會拿到新題目
      this.pack = await fetch(`/api/content/${this.grade}/${this.subject}/${this.monsterId}`).then((r) =>
        r.json()
      );

      this._renderAll();
      if (message && this.els.feedbackEl) {
        this.els.feedbackEl.textContent = message;
        this.els.feedbackEl.className = "feedback wrong";
        this.els.feedbackEl.style.opacity = "1";
        setTimeout(() => {
          this.els.feedbackEl.style.opacity = "0";
        }, 1200);
      }
      await this._persist();
      this._askCurrentQuestion();
    }

    _useHealItem() {
      const prog = this._progress();
      if ((prog.heal_items || 0) <= 0) return;
      if (prog.player_hp >= PLAYER_MAX_HP) return;
      prog.heal_items -= 1;
      prog.player_hp = Math.min(PLAYER_MAX_HP, prog.player_hp + 1);
      this._renderAll();
      this._persist();
    }
  }

  NS.Battle = { BattleSession, PLAYER_MAX_HP, MONSTER_MAX_HP };
})(window);
