import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronLeft } from "lucide-react";
import { useDesktop } from "../lib/desktop.ts";
import { useOptionalNav, usePageState } from "../lib/nav.tsx";
import { GlassButton } from "./controls.tsx";

type PageProps = {
  title: string;
  actions?: ReactNode;
  hero?: ReactNode;
  largeTitle?: boolean;
  bottomBar?: ReactNode;
  children: ReactNode;
  onBack?: () => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
  padded?: boolean;
};

export function Page({ title, actions, hero, largeTitle = true, bottomBar, children, onBack, scrollRef, padded = true }: PageProps) {
  const nav = useOptionalNav();
  const desktop = useDesktop();
  const { active, depth, tabBar } = usePageState();
  const ownRef = useRef<HTMLDivElement>(null);
  const scroller = scrollRef ?? ownRef;
  const headerRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const isRoot = depth === 0;
  const back = onBack ?? (isRoot || !nav ? undefined : nav.pop);
  const overlay = !desktop && (isRoot || Boolean(hero));
  const barHeight = desktop ? 60 : isRoot && !hero ? 64 : 56;
  const showLarge = largeTitle && !hero && !desktop;

  useEffect(() => {
    const root = scroller.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    const header = headerRef.current?.offsetHeight ?? barHeight;
    const observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      root,
      rootMargin: `-${header}px 0px 0px 0px`,
      threshold: 0,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [scroller, barHeight]);

  useEffect(() => {
    if (active) document.title = `${title} · Obi Ágil`;
  }, [active, title]);

  useEffect(() => {
    if (!active || !isRoot) return;
    const toTop = () => scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.addEventListener("obra:top", toTop);
    return () => window.removeEventListener("obra:top", toTop);
  }, [active, isRoot, scroller]);

  const inlineTitleVisible = desktop || collapsed || (!showLarge && !hero);
  const bottomSpace = bottomBar ? 120 : tabBar ? 112 : 40;

  return (
    <div
      ref={scroller}
      className={`absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background ${active ? "vt-page" : ""}`}
      style={{ scrollPaddingTop: `calc(var(--safe-top) + ${barHeight + 8}px)`, scrollPaddingBottom: `calc(var(--safe-bottom) + ${bottomSpace}px)` }}
    >
      <header
        ref={headerRef}
        className="pointer-events-none sticky top-0 z-30"
        style={{ height: `calc(var(--safe-top) + ${barHeight}px)`, marginBottom: overlay ? `calc(-1 * (var(--safe-top) + ${barHeight}px))` : undefined }}
      >
        <div aria-hidden="true" className="nav-edge transition-opacity duration-300" style={{ opacity: collapsed || !overlay ? 1 : 0 }} />
        <div className="relative flex h-full items-center gap-2 px-3 lg:px-6" style={{ paddingTop: "var(--safe-top)" }}>
          {back ? (
            <span className="pointer-events-auto">
              <GlassButton label="Voltar" onClick={back}>
                <ChevronLeft strokeWidth={2.4} aria-hidden="true" />
              </GlassButton>
            </span>
          ) : null}
          <p
            aria-hidden={!inlineTitleVisible}
            className={`pointer-events-none absolute max-w-[56%] truncate transition-[opacity,translate] duration-300 ${
              desktop && !back
                ? "left-8 translate-x-0 text-[28px] leading-8 font-bold tracking-[-0.03em]"
                : "left-1/2 -translate-x-1/2 type-headline"
            } ${inlineTitleVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
            style={{ top: `calc(var(--safe-top) + ${barHeight / 2 - (desktop && !back ? 16 : 11)}px)` }}
          >
            {title}
          </p>
          <div className="pointer-events-auto ml-auto flex items-center gap-2">{actions}</div>
        </div>
      </header>

      {hero}

      {showLarge ? (
        <div
          className={`flex items-center pl-4 lg:pl-8 ${isRoot ? "pr-[120px] lg:pr-8" : "pr-4 pb-1 lg:pr-8"}`}
          style={{ paddingTop: isRoot ? "var(--safe-top)" : 0, minHeight: isRoot ? `calc(var(--safe-top) + ${barHeight}px)` : 48 }}
        >
          <h1 className="min-w-0 truncate type-large">{title}</h1>
        </div>
      ) : (
        <h1 className="sr-only">{title}</h1>
      )}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <div className={padded ? "px-4 lg:px-8" : ""} style={{ paddingBottom: `calc(var(--safe-bottom) + ${bottomSpace}px)` }}>
        {children}
      </div>

      {bottomBar ? (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 lg:px-8" style={{ paddingBottom: "max(10px, var(--safe-bottom))" }}>
          {bottomBar}
        </div>
      ) : null}
    </div>
  );
}
