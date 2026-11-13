import { useEffect, useState } from "react";
import { runTransition } from "../../lib/nav.tsx";
import type { Role } from "../../lib/types.ts";
import { AuthFlow, type AuthMode, type Prefill } from "./AuthFlow.tsx";
import { onboardingIntent } from "./intent.ts";
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
    document.title = screen.name === "welcome" ? "Obra Ágil" : screen.mode === "signup" ? "Criar conta · Obra Ágil" : "Entrar · Obra Ágil";
  }, [screen]);

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
