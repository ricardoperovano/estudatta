import { t } from "@/i18n";
import { Question } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useTourStore } from "./store";

/** Botão "?" fixo: revê o tour da página aberta. Some quando a página não tem tour (fica visível, sob a camada, durante o tour, que aponta para ele no fim). */
export function TourHelpButton({ className, inline = false }: { className?: string; inline?: boolean }) {
  const page = useTourStore((s) => s.page);
  const start = useTourStore((s) => s.start);
  if (!page) return null;
  return (
    <button
      type="button"
      data-tour="ajuda"
      onClick={() => start(page)}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-surface text-neutral-300 shadow-sm hover:text-primary focus-visible:ring-2 focus-visible:ring-accent",
        // no celular fica no cabeçalho (inline); do tablet para cima, fixo no canto
        inline ? "" : "fixed right-5 top-4 z-30 hidden tablet:flex",
        className,
      )}
      aria-label={t("Ver o tour desta página: {{v0}}", { v0: page.title })}
      title={t("Ver o tour desta página")}
    >
      <Question size={18} weight="bold" aria-hidden />
    </button>
  );
}
