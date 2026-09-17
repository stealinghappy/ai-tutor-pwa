/*
 * AI 家教遊戲系統 - 音效/語音播放
 * 音效檔還沒生成時安靜失敗，絕不讓遊戲卡住。
 *
 * 資源路徑用 window.AITUTOR_ASSET_BASE 當前綴（本機版 index.html 沒設定
 * 時預設 "/"，維持原本行為；遠端版 pwa/index.html 會設成 "../"，因為
 * GitHub Pages 上這頁跟 assets/ 資料夾中間多隔了一層 pwa/ 目錄，用
 * 根目錄絕對路徑 "/assets/..." 在 repo 不是部署在網域根目錄時會抓不到檔案）。
 */
(function (global) {
  const NS = (global.AITutor = global.AITutor || {});

  const ASSET_BASE = global.AITUTOR_ASSET_BASE !== undefined ? global.AITUTOR_ASSET_BASE : "/";

  const SFX_FILES = {
    correct: ASSET_BASE + "assets/sfx/correct.mp3",
    wrong: ASSET_BASE + "assets/sfx/wrong.mp3",
    coin: ASSET_BASE + "assets/sfx/coin.mp3",
    defeat: ASSET_BASE + "assets/sfx/defeat.mp3",
  };

  const _cache = {};

  function play(name) {
    const src = SFX_FILES[name];
    if (!src) return;
    try {
      let audio = _cache[name];
      if (!audio) {
        audio = new Audio(src);
        _cache[name] = audio;
      }
      audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      // 音效是加分項，缺檔不該擋遊戲
    }
  }

  // 英文單字發音：只在使用者主動點喇叭按鈕時呼叫，不自動播
  function speakWord(voiceFile) {
    if (!voiceFile) return;
    try {
      const audio = new Audio(ASSET_BASE + voiceFile.replace(/^\/+/, ""));
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      // ignore
    }
  }

  NS.Audio = { play, speakWord };
})(window);
