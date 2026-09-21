import { t } from "@/i18n";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface ContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** "sheet" = folha inferior no celular (raio 14 em cima), diálogo centralizado no desktop */
  mode?: "dialog" | "sheet";
  title: string;
  description?: React.ReactNode;
  hideTitle?: boolean;
  width?: string;
}

/** Diálogo/folha: superfície, raio 14, elevação lg, backdrop neutro-900 a 55–70%. */
export function DialogContent({
  mode = "dialog",
  title,
  description,
  hideTitle,
  width,
  className,
  children,
  ...props
}: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--color-neutral-900)_60%,transparent)] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-[14px] bg-surface shadow-lg outline-none",
          mode === "sheet"
            ? "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-lg px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-3 data-[state=open]:animate-slide-up tablet:inset-auto tablet:left-1/2 tablet:top-1/2 tablet:w-[min(520px,calc(100%-32px))] tablet:-translate-x-1/2 tablet:-translate-y-1/2 tablet:rounded-lg tablet:p-[22px]"
            : "left-1/2 top-1/2 max-h-[92dvh] w-[min(440px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg p-[16px] data-[state=open]:animate-fade-in",
          className,
        )}
        style={width ? { width } : undefined}
        {...props}
      >
        {mode === "sheet" ? (
          <div aria-hidden className="mx-auto h-1 w-9 rounded-full bg-neutral-700 tablet:hidden" />
        ) : null}
        <div className={cn("flex items-start justify-between gap-3", hideTitle && "sr-only")}>
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-[20px] font-medium leading-tight">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-[14px] text-neutral-400">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          {mode === "dialog" ? (
            <DialogPrimitive.Close
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-neutral-400 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]"
              aria-label={t("Fechar")}
            >
              <X size={18} />
            </DialogPrimitive.Close>
          ) : null}
        </div>
        {!description ? (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        ) : null}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-1 flex flex-wrap justify-end gap-2", className)} {...props} />;
}
