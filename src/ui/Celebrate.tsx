import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { chime } from "../lib/feedback.ts";
import { Button } from "./controls.tsx";
import { Mascot, type MascotMood } from "./Mascot.tsx";
import { overlayRoot, trapTab } from "./modal.ts";

const colors = ["var(--primary)", "var(--mascot-hat)", "var(--mascot-boot)", "var(--mascot-cheek)", "var(--switch)", "var(--tone-indigo)"];

function between(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function Confetti({ count = 70 }: { count?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      dx: between(-180, 180),
      up: between(-280, -120),
      fall: between(280, 560),
      rot: between(-900, 900),
      delay: between(0, 160),
      dur: between(1150, 1800),
      color: colors[i % colors.length],
      round: Math.random() < 0.3,
      w: between(6, 10),
      h: between(9, 15),
    })),
  );
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              width: p.w,
              height: p.round ? p.w : p.h,
              borderRadius: p.round ? 999 : 2,
              background: p.color,
              "--dx": `${p.dx}px`,
              "--up": `${p.up}px`,
              "--fall": `${p.fall}px`,
              "--rot": `${p.rot}deg`,
              "--delay": `${p.delay}ms`,
              "--dur": `${p.dur}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function CheckBadge({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" className={className} aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill="var(--success)" />
      <circle className="check-ring" cx="30" cy="30" r="27" fill="none" stroke="var(--card)" strokeWidth="3" opacity="0.35" />
      <path className="check-tick" d="M18 31 L26 39 L42 22" fill="none" stroke="var(--card)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SuccessOverlay({
  open,
  title,
  message,
  primary,
  secondary,
  mood = "celebrate",
}: {
  open: boolean;
  title: string;
  message?: string;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  mood?: MascotMood;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    chime("success");
    const timer = window.setTimeout(() => buttonRef.current?.focus(), 500);
    const onKey = (event: KeyboardEvent) => trapTab(event, rootRef.current);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-title"
      className="anim-fade absolute inset-0 z-[80] flex flex-col"
      style={{ background: "radial-gradient(130% 70% at 50% 0%, var(--celebrate-glow) 0%, var(--card) 62%)" }}
    >
      <Confetti />
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="anim-pop relative">
          <Mascot mood={mood} size={170} />
          <CheckBadge className="absolute -right-1 bottom-8 anim-pop" />
        </div>
        <h2 id="success-title" className="anim-rise mt-6 type-title1" style={{ animationDelay: "140ms" }}>
          {title}
        </h2>
        {message ? (
          <p className="anim-rise mt-2 max-w-[300px] type-body text-muted-foreground" style={{ animationDelay: "220ms" }}>
            {message}
          </p>
        ) : null}
      </div>
      <div className="anim-rise flex flex-col gap-1 px-5 pt-4" style={{ animationDelay: "300ms", paddingBottom: "calc(var(--safe-bottom) + 18px)" }}>
        <Button ref={buttonRef} onClick={primary.onClick}>
          {primary.label}
        </Button>
        {secondary ? (
          <Button variant="plain" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        ) : null}
      </div>
    </div>,
    overlayRoot(),
  );
}
