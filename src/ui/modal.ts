export function overlayRoot() {
  return document.getElementById("overlays") ?? document.body;
}

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusable));
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const current = document.activeElement;
  if (!container.contains(current)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && current === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
}
