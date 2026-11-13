import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { GlassButton, Spinner } from "./controls.tsx";
import { overlayRoot, trapTab } from "./modal.ts";

const openStack: string[] = [];

function usePresence(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);
  return { mounted, closing };
}

function useModalBehavior(open: boolean, onClose: () => void, panel: RefObject<HTMLDivElement | null>) {
  const id = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    openStack.push(id);
    const focusTimer = window.setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
      target?.focus({ preventScroll: true });
    }, 80);
    const onKey = (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return;
      if (event.key === "Escape") closeRef.current();
      else trapTab(event, panel.current);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      const index = openStack.indexOf(id);
      if (index >= 0) openStack.splice(index, 1);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, id, panel]);
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  confirm,
  footer,
  large = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirm?: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean };
  footer?: ReactNode;
  large?: boolean;
}) {
  const { mounted, closing } = usePresence(open, 260);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);
  useModalBehavior(open, onClose, panelRef);

  if (!mounted) return null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    start.current = { y: event.clientY, t: performance.now() };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setDrag(Math.max(0, event.clientY - start.current.y));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const distance = event.clientY - start.current.y;
    const velocity = distance / (performance.now() - start.current.t);
    start.current = null;
    setDragging(false);
    if (distance > 120 || velocity > 0.7) onClose();
    setDrag(0);
  };

  return createPortal(
    <div className="absolute inset-0 z-[70] flex flex-col justify-end">
      <div aria-hidden="true" className={`absolute inset-0 bg-black/25 ${closing ? "scrim-out" : "scrim-in"}`} onClick={onClose} />
      <div
        style={{
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: dragging ? "none" : "transform 320ms var(--ease-ios)",
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-closing={closing || undefined}
          className={`sheet-panel relative mx-2 flex flex-col overflow-hidden rounded-[34px] bg-background outline-none elev-2 ${
            large ? "h-[calc(100dvh-var(--safe-top)-28px)] md:h-[calc(min(852px,100dvh-48px)-var(--safe-top)-28px)]" : "max-h-[calc(100dvh-var(--safe-top)-28px)] md:max-h-[calc(min(852px,100dvh-48px)-var(--safe-top)-28px)]"
          }`}
          style={{ marginBottom: "max(8px, calc(var(--safe-bottom) - 12px))" }}
        >
          <div
            className="relative flex h-[62px] shrink-0 touch-none items-center px-3"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span aria-hidden="true" className="absolute top-[7px] left-1/2 h-[5px] w-9 -translate-x-1/2 rounded-full bg-border" />
            <GlassButton label="Fechar" onClick={onClose}>
              <X strokeWidth={2.4} aria-hidden="true" />
            </GlassButton>
            <h2 id={titleId} className="pointer-events-none absolute left-1/2 max-w-[56%] -translate-x-1/2 truncate type-headline">
              {title}
            </h2>
            {confirm ? (
              <button
                type="button"
                aria-label={confirm.label}
                title={confirm.label}
                disabled={confirm.disabled}
                onClick={confirm.loading ? undefined : confirm.onClick}
                className="ml-auto grid size-11 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-200 active:scale-90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {confirm.loading ? <Spinner /> : <Check className="size-[22px]" strokeWidth={2.6} aria-hidden="true" />}
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">{children}</div>
          {footer ? <div className="shrink-0 px-4 pt-2 pb-4">{footer}</div> : null}
        </div>
      </div>
    </div>,
    overlayRoot(),
  );
}

export type SheetAction = { label: string; onClick: () => void; destructive?: boolean };

export function ActionSheet({
  open,
  onClose,
  title,
  message,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions: SheetAction[];
}) {
  const { mounted, closing } = usePresence(open, 240);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehavior(open, onClose, panelRef);
  if (!mounted) return null;
  return createPortal(
    <div className="absolute inset-0 z-[75] flex flex-col justify-end px-2" style={{ paddingBottom: "max(10px, var(--safe-bottom))" }}>
      <div aria-hidden="true" className={`absolute inset-0 bg-black/25 ${closing ? "scrim-out" : "scrim-in"}`} onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title ?? "Opções"} tabIndex={-1} data-closing={closing || undefined} className="sheet-panel relative flex flex-col gap-2 outline-none">
        <div className="glass-strong overflow-hidden rounded-[22px]">
          {title || message ? (
            <div className="border-b border-border px-6 py-3.5 text-center">
              {title ? <p className="type-footnote font-semibold text-muted-foreground">{title}</p> : null}
              {message ? <p className="mt-0.5 type-footnote text-muted-foreground">{message}</p> : null}
            </div>
          ) : null}
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              data-autofocus={index === 0 ? true : undefined}
              onClick={() => {
                onClose();
                action.onClick();
              }}
              className={`block h-[56px] w-full cursor-pointer type-title3 font-normal transition-colors active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${
                index > 0 ? "border-t border-border" : ""
              } ${action.destructive ? "text-destructive" : "text-primary"}`}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="glass-strong h-[56px] w-full cursor-pointer rounded-[22px] type-title3 text-primary active:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          Cancelar
        </button>
      </div>
    </div>,
    overlayRoot(),
  );
}
