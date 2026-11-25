import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { DesktopNav } from "../ui/DesktopNav.tsx";
import { TabBar, type TabDef } from "../ui/TabBar.tsx";
import { useDesktop } from "./desktop.ts";
import { postNative } from "./native.ts";

export type Route = { key: number; name: string; params: Record<string, string> };
type Params = Record<string, string>;

export type NavApi = {
  tab: string;
  push: (name: string, params?: Params) => void;
  pop: () => void;
  popToRoot: () => void;
  switchTab: (tab: string, then?: { name: string; params?: Params }) => void;
};

type PageState = { active: boolean; depth: number; tabBar: boolean };

const NavContext = createContext<NavApi | null>(null);
const PageContext = createContext<PageState>({ active: true, depth: 0, tabBar: false });

export function useOptionalNav() {
  return useContext(NavContext);
}

export function useNav() {
  const api = useOptionalNav();
  if (!api) throw new Error("useNav precisa estar dentro de <Shell>");
  return api;
}

export function usePageState() {
  return useContext(PageContext);
}

type StartViewTransition = (update: () => void) => {
  finished: Promise<void>;
  ready: Promise<void>;
};

export function runTransition(kind: "push" | "pop" | "tab" | "fade", update: () => void) {
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!start || reduce) {
    update();
    return;
  }
  document.documentElement.dataset.nav = kind;
  const transition = start.call(document, () => flushSync(update));
  transition.ready.catch(() => undefined);
  transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (document.documentElement.dataset.nav === kind) delete document.documentElement.dataset.nav;
    });
}

let routeKey = 0;
function makeRoute(name: string, params: Params = {}): Route {
  routeKey += 1;
  return { key: routeKey, name, params };
}

type ShellState = { tab: string; stacks: Record<string, Route[]> };

export function Shell({
  tabs,
  render,
  hideTabBar,
  layout = "market",
}: {
  tabs: TabDef[];
  render: (route: Route) => ReactNode;
  hideTabBar?: (route: Route) => boolean;
  layout?: "market" | "saas";
}) {
  const [state, setState] = useState<ShellState>(() => ({
    tab: tabs[0].id,
    stacks: Object.fromEntries(tabs.map((t) => [t.id, [makeRoute(t.id)]])),
  }));

  const api = useMemo<NavApi>(
    () => ({
      tab: state.tab,
      push: (name, params) =>
        runTransition("push", () =>
          setState((s) => ({ ...s, stacks: { ...s.stacks, [s.tab]: [...s.stacks[s.tab], makeRoute(name, params)] } })),
        ),
      pop: () =>
        runTransition("pop", () =>
          setState((s) => {
            const stack = s.stacks[s.tab];
            if (stack.length < 2) return s;
            return { ...s, stacks: { ...s.stacks, [s.tab]: stack.slice(0, -1) } };
          }),
        ),
      popToRoot: () =>
        runTransition("pop", () => setState((s) => ({ ...s, stacks: { ...s.stacks, [s.tab]: s.stacks[s.tab].slice(0, 1) } }))),
      switchTab: (tab, then) => {
        if (tab === state.tab && !then) {
          if (state.stacks[tab].length > 1) {
            runTransition("pop", () => setState((s) => ({ ...s, stacks: { ...s.stacks, [tab]: s.stacks[tab].slice(0, 1) } })));
          } else {
            window.dispatchEvent(new CustomEvent("obra:top"));
          }
          return;
        }
        runTransition(then ? "push" : "tab", () =>
          setState((s) => ({
            tab,
            stacks: then ? { ...s.stacks, [tab]: [s.stacks[tab][0], makeRoute(then.name, then.params)] } : s.stacks,
          })),
        );
      },
    }),
    [state],
  );

  useEffect(() => {
    const onBack = () => {
      if (state.stacks[state.tab].length > 1) api.pop();
      else if (state.tab !== tabs[0].id) api.switchTab(tabs[0].id);
      else postNative({ type: "exit" });
    };
    window.addEventListener("obra:navback", onBack);
    return () => window.removeEventListener("obra:navback", onBack);
  }, [api, state, tabs]);

  const desktop = useDesktop();
  const activeStack = state.stacks[state.tab];
  const top = activeStack[activeStack.length - 1];
  const showTabBar = !desktop && !hideTabBar?.(top);

  return (
    <NavContext.Provider value={api}>
      <div className={`absolute inset-0 flex ${layout === "saas" ? "lg:bg-[#e6e8ee]" : "lg:bg-card"}`}>
        {desktop ? <DesktopNav layout={layout} tabs={tabs} tab={state.tab} route={top} /> : null}
        <div className={`stage min-w-0 flex-1 ${layout === "saas" ? "stage-saas" : ""}`}>
          {tabs.map((t) =>
            state.stacks[t.id].map((route, index, stack) => {
              const active = t.id === state.tab && index === stack.length - 1;
              return (
                <PageContext.Provider key={route.key} value={{ active, depth: index, tabBar: !desktop && !hideTabBar?.(route) }}>
                  <div
                    className="absolute inset-0"
                    style={{ visibility: active ? "visible" : "hidden" }}
                    inert={!active}
                    aria-hidden={active ? undefined : true}
                  >
                    {render(route)}
                  </div>
                </PageContext.Provider>
              );
            }),
          )}
          {showTabBar ? <TabBar tabs={tabs} active={state.tab} onChange={(id) => api.switchTab(id)} /> : null}
        </div>
      </div>
    </NavContext.Provider>
  );
}
