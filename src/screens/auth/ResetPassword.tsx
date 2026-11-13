import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { runTransition } from "../../lib/nav.tsx";
import { actions } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import { Button } from "../../ui/controls.tsx";
import { MascotSays } from "../../ui/Mascot.tsx";
import { PasswordField } from "./AuthFields.tsx";

export function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = "Nova senha · Obra Ágil";
  }, []);

  async function save() {
    if (password.length < 8) return setError("A senha precisa de pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As duas senhas estão diferentes.");
    setPending(true);
    setError("");
    try {
      const session = await actions.resetPassword(token, password);
      toast("Senha nova salva");
      runTransition("fade", () => {
        actions.enter(session);
        onDone();
      });
    } catch (problem) {
      setError(errorMessage(problem));
      setPending(false);
    }
  }

  return (
    <main className="vt-page absolute inset-0 flex flex-col bg-background">
      <form
        className="anim-step min-h-0 flex-1 overflow-y-auto px-5 pb-6"
        style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <MascotSays mood="think">
          <h1 className="type-title3">Crie uma senha nova.</h1>
        </MascotSays>
        <div className="mt-6 flex flex-col gap-4">
          <PasswordField label="Nova senha" autoComplete="new-password" value={password} autoFocus onChange={setPassword} hint="Pelo menos 8 caracteres." />
          <PasswordField label="Repita a senha" autoComplete="new-password" value={confirm} onChange={setConfirm} error={error} />
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      <div className="flex flex-col gap-2 px-5 pt-2" style={{ paddingBottom: "calc(var(--safe-bottom) + 14px)" }}>
        <Button loading={pending} disabled={!password || !confirm} onClick={() => void save()}>
          Salvar e entrar
        </Button>
        <Button variant="plain" size="md" onClick={() => runTransition("fade", onDone)}>
          Cancelar
        </Button>
      </div>
    </main>
  );
}
