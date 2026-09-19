import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { Check, Info, Warning, WifiSlash, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Kind = "info" | "success" | "error" | "offline";
interface ToastItem {
  id: number;
  kind: Kind;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const listeners = new Set<(t: ToastItem) => void>();
let seq = 0;

export function toast(kind: Kind, title: string, description?: string, action?: ToastItem["action"]) {
  const item: ToastItem = { id: ++seq, kind, title, description, action };
  listeners.forEach((l) => l(item));
}
toast.success = (t: string, d?: string) => toast("success", t, d);
toast.error = (t: string, d?: string) => toast("error", t, d);
toast.info = (t: string, d?: string) => toast("info", t, d);
toast.offline = (t: string, d?: string) => toast("offline", t, d);

const icon: Record<Kind, React.ReactNode> = {
  info: <Info size={16} className="text-info" aria-hidden />,
  success: <Check size={16} className="text-success" aria-hidden />,
  error: <Warning size={16} className="text-error" aria-hidden />,
  offline: <WifiSlash size={16} className="text-info" aria-hidden />,
};

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  React.useEffect(() => {
    const l = (t: ToastItem) => setItems((prev) => [...prev.slice(-3), t]);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return (
    <ToastPrimitive.Provider duration={5000} swipeDirection="down">
      {items.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          onOpenChange={(open) => {
            if (!open) setItems((prev) => prev.filter((x) => x.id !== t.id));
          }}
          className={cn(
            "flex items-start gap-2.5 rounded-md bg-surface-raised p-3 text-[14px] shadow-md data-[state=open]:animate-slide-up",
            t.kind === "error" && "bg-error-tint",
          )}
        >
          <span className="mt-0.5 shrink-0">{icon[t.kind]}</span>
          <div className="flex flex-1 flex-col gap-0.5">
            <ToastPrimitive.Title className="font-medium">{t.title}</ToastPrimitive.Title>
            {t.description ? <ToastPrimitive.Description className="text-[13px] text-neutral-400">{t.description}</ToastPrimitive.Description> : null}
            {t.action ? (
              <ToastPrimitive.Action altText={t.action.label} asChild>
                <button type="button" onClick={t.action.onClick} className="mt-1 self-start text-[13px] text-accent">
                  {t.action.label}
                </button>
              </ToastPrimitive.Action>
            ) : null}
          </div>
          <ToastPrimitive.Close aria-label="Fechar" className="text-neutral-500 hover:text-primary">
            <X size={14} />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-[calc(var(--layout-bottom-nav-height)+12px)] right-4 z-[60] flex w-[min(360px,calc(100%-32px))] flex-col gap-2 tablet:bottom-6" />
    </ToastPrimitive.Provider>
  );
}
