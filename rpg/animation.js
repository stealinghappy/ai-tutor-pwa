/*
 * AI 家教遊戲系統 - 逐格動畫播放器
 *
 * 從 assets/monsters/{subject}/{monster_id}/{anim}/frame_XXX.png 依序播放。
 * AGY 還沒生成圖檔時（或某個動作缺格），自動退回文字色塊佔位，
 * 讓引擎在美術資產齊全前也能整套跑起來測試。
 */
(function (global) {
  const NS = (global.AITutor = global.AITutor || {});

  const FRAME_MS = 90; // 每格動畫間隔（毫秒）

  const PLACEHOLDER_LABEL = {
    idle: "待機",
    attack: "攻擊",
    hurt: "受傷",
    defeat: "擊敗",
  };

  class SpritePlayer {
    constructor(containerEl) {
      this.container = containerEl;
      this.container.classList.add("sprite-player");
      this.container.innerHTML = "";

      this.imgEl = document.createElement("img");
      this.imgEl.className = "sprite-frame-img";
      this.imgEl.alt = "";
      this.imgEl.style.display = "none";

      this.labelEl = document.createElement("div");
      this.labelEl.className = "sprite-placeholder-label";

      this.container.appendChild(this.imgEl);
      this.container.appendChild(this.labelEl);

      this._timer = null;
      this._placeholderCache = {}; // "baseUrl/anim" -> true 代表確定沒有實體圖檔
    }

    stop() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }

    /**
     * @param {string} baseUrl   例如 /assets/monsters/math/goblin_numeral_001
     * @param {string} animName  idle / attack / hurt / defeat
     * @param {number} frameCount 總影格數（來自怪獸 meta.json 的 image_prompt.frames）
     * @param {object} opts      { loop:boolean, onComplete:fn }
     */
    play(baseUrl, animName, frameCount, opts) {
      opts = opts || {};
      this.stop();

      const key = baseUrl + "/" + animName;
      if (this._placeholderCache[key]) {
        this._showPlaceholder(animName);
        if (opts.onComplete && !opts.loop) opts.onComplete();
        return;
      }

      let frame = 1;
      const total = Math.max(1, frameCount || 1);

      const showFrame = () => {
        const url = `${baseUrl}/${animName}/frame_${String(frame).padStart(3, "0")}.png`;
        this.imgEl.onload = () => {
          this.labelEl.style.display = "none";
          this.imgEl.style.display = "block";
        };
        this.imgEl.onerror = () => {
          // 這隻怪獸這個動作還沒有實體圖檔 -> 記住，之後直接用色塊佔位
          this._placeholderCache[key] = true;
          this._showPlaceholder(animName);
          if (opts.onComplete && !opts.loop) opts.onComplete();
        };
        this.imgEl.src = url;
      };

      showFrame();
      this._timer = setInterval(() => {
        frame += 1;
        if (frame > total) {
          if (opts.loop) {
            frame = 1;
          } else {
            this.stop();
            if (opts.onComplete) opts.onComplete();
            return;
          }
        }
        showFrame();
      }, FRAME_MS);
    }

    _showPlaceholder(animName) {
      this.stop();
      this.imgEl.style.display = "none";
      this.labelEl.style.display = "flex";
      this.labelEl.textContent = PLACEHOLDER_LABEL[animName] || animName;
      this.labelEl.dataset.anim = animName;
    }
  }

  NS.Animation = { SpritePlayer };
})(window);
