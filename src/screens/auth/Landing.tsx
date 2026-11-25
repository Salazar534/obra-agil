export function AuthShowcase({ onHome, mode }: { onHome: () => void; mode: "signup" | "signin" }) {
  return (
    <div className="relative flex min-h-0 flex-col bg-background">
      <button
        type="button"
        onClick={onHome}
        className="absolute top-8 left-8 z-10 flex cursor-pointer items-center gap-2.5 rounded-full border border-border bg-card py-1.5 pr-4 pl-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <img src="/img/logo-mark.png" alt="" className="size-8 rounded-[9px] object-cover" />
        <span className="text-[16px] font-semibold tracking-[-0.04em]">Obi Ágil</span>
      </button>
      <div className="relative min-h-0 flex-1">
        <img src="/img/landing/yard.jpg" alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 p-8">
          <div className="max-w-[360px] rounded-[24px] bg-card px-5 py-4">
            <p className="text-[22px] leading-7 font-semibold tracking-[-0.03em]">
              {mode === "signin" ? "Que bom te ver." : "A conta leva um minuto."}
            </p>
            <p className="mt-1.5 text-[15px] leading-6 text-muted-foreground">
              {mode === "signin" ? "Entra para ver o que está livre perto do endereço." : "Pix ou cartão em até 12x. A caução volta na devolução."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
