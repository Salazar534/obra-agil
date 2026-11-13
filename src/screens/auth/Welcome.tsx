import { useEffect } from "react";
import { postNative } from "../../lib/native.ts";
import { Button } from "../../ui/controls.tsx";
import { Mascot } from "../../ui/Mascot.tsx";

export function Welcome({ onSignUp, onSignIn }: { onSignUp: () => void; onSignIn: () => void }) {
  useEffect(() => {
    const onBack = () => postNative({ type: "exit" });
    window.addEventListener("obra:navback", onBack);
    return () => window.removeEventListener("obra:navback", onBack);
  }, []);

  return (
    <main className="vt-page absolute inset-0 flex flex-col overflow-y-auto bg-card">
      <div
        className="anim-pop relative mx-3 h-[44%] min-h-[300px] shrink-0 overflow-hidden rounded-[40px]"
        style={{ marginTop: "calc(var(--safe-top) + 8px)", background: "var(--hero-sky)" }}
      >
        <img src="/img/hero.webp" alt="" className="size-full object-cover" />
      </div>
      <div className="relative -mt-[74px] flex items-end gap-1 px-4">
        <Mascot mood="wave" size={116} className="mascot-enter shrink-0" />
        <div className="anim-pop mb-[86px] rounded-[22px] rounded-bl-[6px] bg-card px-4 py-2.5 elev-2" style={{ animationDelay: "520ms" }}>
          <p className="type-headline">Oi! Eu sou o Obi.</p>
        </div>
      </div>
      <div className="px-6">
        <h1 className="anim-rise type-large" style={{ animationDelay: "160ms" }}>
          Obra Ágil
        </h1>
        <p className="anim-rise mt-2 type-body text-muted-foreground" style={{ animationDelay: "240ms" }}>
          Alugue equipamentos perto da obra ou anuncie o estoque da sua locadora.
        </p>
      </div>
      <div className="anim-rise mt-auto flex flex-col gap-2.5 px-5 pt-6" style={{ animationDelay: "320ms", paddingBottom: "calc(var(--safe-bottom) + 14px)" }}>
        <Button onClick={onSignUp}>Criar conta</Button>
        <Button variant="tinted" onClick={onSignIn}>
          Já tenho conta
        </Button>
      </div>
    </main>
  );
}
