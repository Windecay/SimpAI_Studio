function simpleaiGradioHeartbeat(client, heartbeatUrl) {
  const url = new URL(heartbeatUrl);
  if (typeof WebSocket === "undefined" || typeof location === "undefined"
      || url.origin !== location.origin || client.options?.token || client.options?.headers) {
    return client.stream(heartbeatUrl);
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  let socket;
  let fallback;
  let fallbackController;
  let closed = false;
  let received = false;
  let retryTimer;
  let attempts = 0;
  const closeSocket = () => {
    if (!socket) return;
    const previous = socket;
    socket = null;
    previous.onclose = null;
    previous.onmessage = null;
    previous.close();
  };
  const stream = {
    close() {
      closed = true;
      clearTimeout(retryTimer);
      closeSocket();
      fallbackController?.abort();
      fallback?.close();
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    }
  };
  const useHttp = () => {
    if (closed || fallback) return;
    // Gradio shares these fields with the generation queue stream.
    const controller = client.abort_controller;
    const instance = client.stream_instance;
    try {
      fallback = client.stream(heartbeatUrl);
      fallbackController = client.abort_controller;
    } finally {
      client.abort_controller = controller;
      client.stream_instance = instance;
    }
  };
  const connect = () => {
    if (closed) return;
    try {
      socket = new WebSocket(url);
    } catch (_) {
      useHttp();
      return;
    }
    socket.onmessage = () => { received = true; attempts = 0; };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (closed) return;
      if (!received) useHttp();
      else retryTimer = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempts++));
    };
  };
  const onPageHide = () => {
    closed = true;
    clearTimeout(retryTimer);
    closeSocket();
    fallbackController?.abort();
    fallback?.close();
  };
  const onPageShow = (event) => {
    if (!event.persisted) return;
    closed = false;
    fallback = null;
    connect();
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  connect();
  return stream;
}
