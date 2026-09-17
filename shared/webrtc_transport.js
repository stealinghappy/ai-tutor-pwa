/**
 * shared/webrtc_transport.js
 *
 * 通用的「遠端連線」傳輸層——在 GitHub Pages 上開的頁面跟家裡沒有固定 IP
 * 的主機之間，透過 WebRTC DataChannel 建立 P2P 連線（STUN 打洞），訊號
 * 交換（offer/answer）借 Telegram 當通道。任何頁面只要在自己的遊戲邏輯
 * script 之前載入這支檔案 + fetch_shim.js，原本寫死呼叫 fetch('/api/...')
 * 的程式碼完全不用改，會自動改走這條 WebRTC 通道（其餘 fetch 呼叫，例如
 * 圖片、音效等靜態資源，不受影響，一樣走原生 fetch）。
 *
 * 跟 signal_relay/telethon_listener.py + webrtc_peer.py 是一組的：
 * 這支檔案負責瀏覽器端的訊號送收（Bot API）+ RTCPeerConnection，家裡
 * 主機端負責用 Telethon 真人帳號 session 收/送同一批訊號 + aiortc 建立
 * 對應的 PeerConnection，並把 DataChannel 收到的 API 請求轉發給本機的
 * game server（server.py）。
 *
 * 本檔案不用任何建置工具、不用 import，直接掛一個全域物件
 * window.AITutorTransport，供 fetch_shim.js 使用。
 */
(function (global) {
  "use strict";

  // ── 設定 ──────────────────────────────────────────────────────────
  // 這是 AI 家教專用的 bot token，僅用於此專案的 WebRTC 訊號轉發，
  // 外洩風險已由專案所有者確認可接受（見專案記錄），不是敏感金鑰。
  const BOT_TOKEN = "8726131538:AAEZq0hSSBxmfF9bBUuFzF-lA36NL2vsf6A";
  const CHAT_ID = 8348964950;
  const TG_API = "https://api.telegram.org/bot" + BOT_TOKEN;
  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const GETUPDATES_TIMEOUT_SEC = 20; // Telegram 長輪詢逾時秒數
  const ANSWER_WAIT_MAX_ROUNDS = 15; // 最多輪詢幾次還沒收到 answer 就算連線失敗
  const REQUEST_TIMEOUT_MS = 15000; // 單一 API 請求等回應的逾時

  function genId(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ── 簡易事件廣播（給頁面顯示連線狀態用）──────────────────────────────
  const listeners = {};
  function on(event, cb) {
    (listeners[event] = listeners[event] || []).push(cb);
  }
  function emit(event, detail) {
    (listeners[event] || []).forEach((cb) => {
      try {
        cb(detail);
      } catch (e) {
        console.error("[AITutorTransport] 事件處理發生錯誤：", e);
      }
    });
  }

  const sessionId = genId("sess");
  let pc = null;
  let channel = null;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const pending = new Map(); // request_id -> { resolve, reject, timer }

  // ── Telegram Bot API 工具 ──────────────────────────────────────────
  async function tgSendMessage(text) {
    const resp = await fetch(TG_API + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: text }),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error("Telegram sendMessage 失敗: " + JSON.stringify(data));
    return data.result;
  }

  async function tgGetUpdates(offset) {
    const url = TG_API + "/getUpdates?timeout=" + GETUPDATES_TIMEOUT_SEC + "&offset=" + offset;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.ok) throw new Error("Telegram getUpdates 失敗: " + JSON.stringify(data));
    return data.result;
  }

  // 長輪詢等待「屬於這個 session 的」answer 訊號
  async function waitForAnswer() {
    let offset = 0;
    try {
      const initial = await tgGetUpdates(-1); // -1 只拿最新一筆，用來取得 offset 起點
      if (initial.length > 0) {
        offset = initial[initial.length - 1].update_id + 1;
      }
    } catch (e) {
      // 初始化 offset 失敗可忽略，退回從 0 開始（可能會多處理幾則舊訊息，無害）
    }

    for (let round = 0; round < ANSWER_WAIT_MAX_ROUNDS; round++) {
      emit("status", "等待主機回應中…（第 " + (round + 1) + " 輪）");
      let updates;
      try {
        updates = await tgGetUpdates(offset);
      } catch (e) {
        emit("status", "訊號查詢失敗，重試中… (" + e.message + ")");
        continue;
      }

      for (const upd of updates) {
        offset = upd.update_id + 1;
        const msg = upd.message;
        if (!msg || !msg.text) continue;
        const text = msg.text.trim();
        if (!text.startsWith("{")) continue;
        let payload;
        try {
          payload = JSON.parse(text);
        } catch (e) {
          continue;
        }
        if (payload.type === "answer" && payload.sdp && payload.session_id === sessionId) {
          return payload.sdp;
        }
      }
    }
    throw new Error("等太久沒收到主機回應，請確認家裡主機端的 telethon_listener.py 有在執行");
  }

  function waitIceGatheringComplete(peerConn) {
    if (peerConn.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      function check() {
        if (peerConn.iceGatheringState === "complete") {
          peerConn.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      }
      peerConn.addEventListener("icegatheringstatechange", check);
      setTimeout(resolve, 8000); // 保險逾時，避免某些網路環境永遠不標記 complete
    });
  }

  function handleChannelMessage(event) {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (e) {
      console.warn("[AITutorTransport] 收到無法解析的訊息", event.data);
      return;
    }
    const entry = pending.get(payload.request_id);
    if (!entry) return; // 可能是逾時後才回來的舊回應，忽略即可
    clearTimeout(entry.timer);
    pending.delete(payload.request_id);
    entry.resolve(payload);
  }

  async function connect() {
    emit("status", "建立 RTCPeerConnection…");
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    channel = pc.createDataChannel("api");

    pc.oniceconnectionstatechange = () => emit("status", "iceConnectionState = " + pc.iceConnectionState);
    pc.onconnectionstatechange = () => emit("status", "connectionState = " + pc.connectionState);

    channel.onmessage = handleChannelMessage;
    channel.onerror = (e) => console.error("[AITutorTransport] DataChannel 錯誤", e);
    channel.onclose = () => emit("status", "連線已中斷");

    const opened = new Promise((resolve) => {
      channel.onopen = () => resolve();
    });

    try {
      emit("status", "建立連線請求…");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emit("status", "等待 ICE gathering 完成…");
      await waitIceGatheringComplete(pc);

      emit("status", "送出連線訊號…");
      await tgSendMessage(JSON.stringify({ type: "offer", sdp: pc.localDescription.sdp, session_id: sessionId }));

      emit("status", "等待家裡主機回應…");
      const answerSdp = await waitForAnswer();

      emit("status", "設定連線，等待打通…");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      await opened;
      emit("status", "連線成功");
      emit("connected");
      readyResolve();
    } catch (err) {
      emit("status", "連線失敗：" + err.message);
      emit("failed", err);
      readyReject(err);
    }
  }

  function request(method, path, body) {
    return ready.then(
      () =>
        new Promise((resolve, reject) => {
          const requestId = genId("req");
          const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new Error("請求逾時：" + method + " " + path));
          }, REQUEST_TIMEOUT_MS);
          pending.set(requestId, { resolve, reject, timer });
          channel.send(JSON.stringify({ request_id: requestId, method: method, path: path, body: body || null }));
        })
    );
  }

  connect();

  global.AITutorTransport = { ready: ready, request: request, on: on, sessionId: sessionId };
})(window);
