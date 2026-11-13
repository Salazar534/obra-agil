import { useSyncExternalStore } from "react";

export type ToastKind = "success" | "error" | "info";
export type ToastItem = { id: number; text: string; kind: ToastKind };

let current: ToastItem | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function toast(text: string, kind: ToastKind = "success") {
  current = { id: Date.now() + Math.random(), text, kind };
  emit();
}

export function dismissToast(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

export function useToast() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
  );
}
