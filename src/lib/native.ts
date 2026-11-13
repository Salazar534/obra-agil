type Bridge = { postMessage: (message: string) => void };

function bridge() {
  return (window as unknown as { ReactNativeWebView?: Bridge }).ReactNativeWebView ?? null;
}

export function isNativeShell() {
  return bridge() !== null;
}

export function postNative(message: Record<string, unknown>) {
  bridge()?.postMessage(JSON.stringify(message));
}

export function requestNative<T>(request: Record<string, unknown>, replyType: string, timeout = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("timeout"));
    }, timeout);

    function onMessage(event: MessageEvent) {
      let data: unknown;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || typeof data !== "object" || (data as { type?: unknown }).type !== replyType) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      const payload = data as T & { error?: string };
      if (payload.error) reject(new Error(payload.error));
      else resolve(payload);
    }

    window.addEventListener("message", onMessage);
    postNative(request);
  });
}
