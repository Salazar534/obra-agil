export function isAuthEmbed() {
  return new URLSearchParams(window.location.search).get("embed") === "1";
}

export function notifyAuthEmbed(action: "close" | "entered") {
  if (window.parent === window) return;
  window.parent.postMessage({ source: "obi-auth", action }, "*");
}
