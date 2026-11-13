import { useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type TabDef = { id: string; label: string; icon: LucideIcon; badge?: number };

type Pill = { left: number; right: number; dir: 1 | -1; animate: boolean };

export function TabBar({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<Pill | null>(null);
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = (animate: boolean) => {
      const button = buttons.current[active];
      if (!button) return;
      const box = list.getBoundingClientRect();
      const tab = button.getBoundingClientRect();
      const left = tab.left - box.left;
      const right = box.right - tab.right;
      setPill((prev) => ({ left, right, dir: prev && left < prev.left ? -1 : 1, animate: animate && prev !== null }));
    };
    measure(true);
    setMoving(true);
    const timer = window.setTimeout(() => setMoving(false), 380);
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(list);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [active, tabs.length]);

  const lead = "260ms var(--ease-ios)";
  const trail = "460ms var(--ease-spring) 40ms";
  const transition = !pill?.animate
    ? "none"
    : pill.dir === 1
      ? `right ${lead}, left ${trail}, transform 320ms var(--ease-ios), background-color 320ms ease, box-shadow 320ms ease`
      : `left ${lead}, right ${trail}, transform 320ms var(--ease-ios), background-color 320ms ease, box-shadow 320ms ease`;

  return (
    <nav
      aria-label="Seções do app"
      className="vt-tabbar pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3"
      style={{ paddingBottom: "max(10px, var(--safe-bottom))" }}
    >
      <div ref={listRef} className="glass pointer-events-auto relative flex h-[64px] w-full max-w-[400px] rounded-full p-[5px]">
        {pill ? (
          <span
            aria-hidden="true"
            className="tab-pill absolute top-[5px] bottom-[5px] rounded-full"
            data-moving={moving && pill.animate ? true : undefined}
            style={{ left: pill.left, right: pill.right, transition }}
          />
        ) : null}
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[tab.id] = node;
              }}
              type="button"
              aria-current={selected ? "page" : undefined}
              aria-label={tab.badge ? `${tab.label}, ${tab.badge} novos` : tab.label}
              className={`relative z-10 flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-full transition-[color,transform] duration-200 active:scale-[0.9] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${
                selected ? "text-primary" : "text-foreground"
              }`}
              onClick={() => onChange(tab.id)}
            >
              <span className="relative">
                <tab.icon className="size-6" strokeWidth={selected ? 2.3 : 1.8} aria-hidden="true" />
                {tab.badge ? (
                  <span className="absolute -top-1.5 -right-3 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-badge px-1 type-caption font-semibold text-white">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                ) : null}
              </span>
              <span className="type-tab max-w-full truncate px-1">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
