import { useEffect, useState } from "react";
import { BellRing, CircleAlert, CircleCheck } from "lucide-react";
import { dismissToast, useToast, type ToastItem } from "../lib/toast.ts";

const icons = {
  success: <CircleCheck className="size-5 text-success" aria-hidden="true" />,
  error: <CircleAlert className="size-5 text-destructive" aria-hidden="true" />,
  info: <BellRing className="size-5 text-primary" aria-hidden="true" />,
};

export function Toaster() {
  const current = useToast();
  const [shown, setShown] = useState<ToastItem | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!current) return;
    setShown(current);
    setLeaving(false);
    const leave = window.setTimeout(() => setLeaving(true), 2800);
    const remove = window.setTimeout(() => {
      dismissToast(current.id);
      setShown(null);
    }, 3100);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, [current]);

  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-0 z-[90] flex justify-center px-4" style={{ paddingTop: "calc(var(--safe-top) + 6px)" }}>
      {shown ? (
        <button
          key={shown.id}
          type="button"
          onClick={() => setLeaving(true)}
          className={`glass-strong pointer-events-auto flex max-w-full cursor-pointer items-center gap-2.5 rounded-full py-2.5 pr-5 pl-3.5 text-left ${leaving ? "toast-out" : "toast-in"}`}
        >
          {icons[shown.kind]}
          <span className="truncate type-subhead font-semibold">{shown.text}</span>
        </button>
      ) : null}
    </div>
  );
}
