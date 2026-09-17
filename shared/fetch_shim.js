/**
 * shared/fetch_shim.js
 *
 * 把全域 window.fetch 換成一個攔截版本：路徑開頭是 /api/ 的請求改走
 * webrtc_transport.js 建立的 WebRTC DataChannel（送到家裡主機），其他
 * 請求（圖片、音效等靜態資源）原封不動交給原生 fetch。
 *
 * 必須在 webrtc_transport.js 之後、battle.js / wallet.js / dashboard.js
 * 等遊戲邏輯 script 之前載入。載入後，遊戲程式碼裡原本寫的
 * `fetch('/api/players')` 完全不用改，會自動生效。
 *
 * 只給「遠端版」頁面（game_engine/pwa/ 底下、部署在 GitHub Pages 的版本）
 * 使用；家用區網直接開的原版頁面（game_engine/index.html）不載入這支
 * 檔案，維持原本直接打本機 server 的 fetch，速度更快、也不依賴
 * Telegram 訊號是否正常。
 */
(function (global) {
  "use strict";

  if (!global.AITutorTransport) {
    console.error("[fetch_shim] 找不到 AITutorTransport，請確認 webrtc_transport.js 有先載入");
    return;
  }

  const nativeFetch = global.fetch.bind(global);

  global.fetch = function (input, init) {
    const path = typeof input === "string" ? input : (input && input.url) || "";

    if (!path.startsWith("/api/")) {
      // 靜態資源（圖片、音效…）：這些檔案已經跟頁面一起放在 GitHub Pages
      // 上了，直接用原生 fetch 抓同一個網站底下的檔案即可，不用穿 WebRTC。
      return nativeFetch(input, init);
    }

    const method = (init && init.method) || "GET";
    let body = null;
    if (init && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch (e) {
        body = init.body;
      }
    }

    return global.AITutorTransport.request(method, path, body).then((resp) => {
      const status = resp.status || 200;
      const bodyIsString = typeof resp.body === "string";
      const bodyText = bodyIsString ? resp.body : JSON.stringify(resp.body);
      return new Response(bodyText, {
        status: status,
        headers: { "Content-Type": "application/json" },
      });
    });
  };
})(window);
