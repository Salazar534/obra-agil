import { useEffect, useState } from "react";
import { BatteryFull, Signal, Wifi } from "lucide-react";
import { clock } from "./lib/format.ts";
import { actions, useDB } from "./lib/store.ts";
import { Onboarding } from "./screens/auth/Onboarding.tsx";
import { ResetPassword } from "./screens/auth/ResetPassword.tsx";
import { BusinessApp } from "./screens/business/BusinessApp.tsx";
import { CustomerApp } from "./screens/customer/CustomerApp.tsx";
import { Button, Spinner } from "./ui/controls.tsx";
import { Mascot } from "./ui/Mascot.tsx";
import { Toaster } from "./ui/Toaster.tsx";

function DeviceChrome() {
  const [time, setTime] = useState(() => clock(Date.now()));
  useEffect(() => {
    const timer = window.setInterval(() => setTime(clock(Date.now())), 20_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div aria-hidden="true" className="vt-chrome pointer-events-none absolute inset-0 z-[95] hidden md:block">
      <div className="absolute inset-x-0 top-0 flex h-[50px] items-center justify-between px-[34px] pt-1">
        <span className="w-[86px] text-center text-[16px] font-semibold tabular-nums">{time}</span>
        <span className="flex items-center gap-1.5">
          <Signal className="size-[17px]" strokeWidth={2.6} />
          <Wifi className="size-[17px]" strokeWidth={2.6} />
          <BatteryFull className="size-[26px]" strokeWidth={1.6} />
        </span>
      </div>
      <div className="absolute top-[11px] left-1/2 h-[35px] w-[124px] -translate-x-1/2 rounded-full bg-foreground" />
      <div className="absolute bottom-[8px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-foreground/85" />
    </div>
  );
}

function Splash() {
  return (
    <main className="absolute inset-0 flex flex-col items-center justify-center bg-background" aria-busy="true">
      <Mascot mood="idle" size={120} />
      <p className="mt-2 type-title2">Obra Ágil</p>
      <Spinner className="mt-5 size-6 text-primary" />
    </main>
  );
}

function Offline() {
  const [retrying, setRetrying] = useState(false);
  return (
    <main className="absolute inset-0 flex flex-col items-center justify-center bg-background px-8 text-center">
      <Mascot mood="sad" size={124} />
      <h1 className="mt-4 type-title2">Sem conexão</h1>
      <p className="mt-1.5 max-w-[290px] type-subhead text-muted-foreground">Não conseguimos falar com o servidor do Obra Ágil. Confira a internet e tente de novo.</p>
      <Button
        className="mt-6 max-w-[260px]"
        loading={retrying}
        onClick={async () => {
          setRetrying(true);
          await actions.boot();
          setRetrying(false);
        }}
      >
        Tentar de novo
      </Button>
    </main>
  );
}

export default function App() {
  const db = useDB();
  const me = db.me;
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset"));

  useEffect(() => {
    void actions.boot();
  }, []);

  useEffect(() => {
    const onBack = () => {
      if (document.querySelector('#overlays [role="dialog"]')) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      else window.dispatchEvent(new CustomEvent("obra:navback"));
    };
    window.addEventListener("obra:back", onBack);
    return () => window.removeEventListener("obra:back", onBack);
  }, []);

  let screen;
  if (db.phase === "booting") screen = <Splash />;
  else if (db.phase === "offline") screen = <Offline />;
  else if (resetToken)
    screen = (
      <ResetPassword
        token={resetToken}
        onDone={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setResetToken(null);
        }}
      />
    );
  else if (me) screen = me.role === "business" ? <BusinessApp key={me.id} /> : <CustomerApp key={me.id} />;
  else screen = <Onboarding />;

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="device">
        {screen}
        <div id="overlays" className="pointer-events-none absolute inset-0 z-[60] *:pointer-events-auto" />
        <Toaster />
        <DeviceChrome />
      </div>
    </div>
  );
}
