import { useEffect, useState } from "react";
import { useDesktop } from "../../lib/desktop.ts";
import { runTransition } from "../../lib/nav.tsx";
import type { Role } from "../../lib/types.ts";
import { AuthFlow, type AuthMode, type Prefill } from "./AuthFlow.tsx";
import { onboardingIntent } from "./intent.ts";
import { AuthShowcase, Landing } from "./Landing.tsx";
import { Welcome } from "./Welcome.tsx";

type Screen = { name: "welcome" } | { name: "auth"; mode: AuthMode; role?: Role; prefill?: Prefill; key: number };

export function Onboarding() {
  const [screen, setScreen] = useState<Screen>(() =>
    onboardingIntent.value === "business" ? { name: "auth", mode: "signup", role: "business", key: 1 } : { name: "welcome" },
  );

  useEffect(() => {
    onboardingIntent.value = null;
  }, []);

  useEffect(() => {
    document.title = screen.name === "welcome" ? "Obi Ágil" : screen.mode === "signup" ? "Criar conta · Obi Ágil" : "Entrar · Obi Ágil";
  }, [screen]);

  const desktop = useDesktop();
  const openSignUp = () => runTransition("push", () => setScreen({ name: "auth", mode: "signup", key: Date.now() }));
  const openSignIn = () => runTransition("push", () => setScreen({ name: "auth", mode: "signin", key: Date.now() }));

  if (desktop && screen.name === "welcome") {
    return <Landing onSignUp={openSignUp} onSignIn={openSignIn} />;
  }

  if (desktop && screen.name === "auth") {
    return (
      <div className="absolute inset-0 grid grid-cols-[minmax(0,1fr)_minmax(400px,480px)] bg-[#f4f1ea]">
        <AuthShowcase onHome={() => runTransition("pop", () => setScreen({ name: "welcome" }))} />
        <div className="relative h-full min-h-0 overflow-hidden bg-background">
          <AuthFlow
            key={screen.key}
            mode={screen.mode}
            initialRole={screen.role}
            prefill={screen.prefill}
            onExit={() => runTransition("pop", () => setScreen({ name: "welcome" }))}
            onSwitch={(mode, prefill) => runTransition("push", () => setScreen({ name: "auth", mode, prefill, key: Date.now() }))}
          />
        </div>
      </div>
    );
  }

  if (screen.name === "welcome") {
    return (
      <Welcome
        onSignUp={() => runTransition("push", () => setScreen({ name: "auth", mode: "signup", key: Date.now() }))}
        onSignIn={() => runTransition("push", () => setScreen({ name: "auth", mode: "signin", key: Date.now() }))}
      />
    );
  }

  return (
    <AuthFlow
      key={screen.key}
      mode={screen.mode}
      initialRole={screen.role}
      prefill={screen.prefill}
      onExit={() => runTransition("pop", () => setScreen({ name: "welcome" }))}
      onSwitch={(mode, prefill) => runTransition("push", () => setScreen({ name: "auth", mode, prefill, key: Date.now() }))}
    />
  );
}
