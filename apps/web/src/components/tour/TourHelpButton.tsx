import { Question } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useTourStore } from "./store";

/** Botão "?" fixo: revê o tour da página aberta. Some quando a página não tem tour (fica visível, sob a camada, durante o tour, que aponta para ele no fim). */
export function TourHelpButton({ className }: { className?: string }) {
  const page = useTourStore((s) => s.page);
  const start = useTourStore((s) => s.start);
  if (!page) return null;
  return (
    <button
      type="button"
      data-tour="ajuda"
      onClick={() => start(page)}
      className={cn(
        "fixed right-3 top-[calc(env(safe-area-inset-top,0px)+10px)] z-30 flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-surface text-neutral-300 shadow-sm hover:text-primary focus-visible:ring-2 focus-visible:ring-accent desktop:right-5 desktop:top-4",
        className,
      )}
      aria-label={`Ver o tour desta página: ${page.title}`}
      title="Ver o tour desta página"
    >
      <Question size={18} weight="bold" aria-hidden />
    </button>
  );
}
