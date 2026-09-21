import { t } from "@/i18n";
import { Warning } from "@phosphor-icons/react";
import { Button, Card } from "@/components/ui";
import { importErrorHelp, withPlanUnchanged } from "@/api/imports";
import { cn } from "@/lib/utils";

interface Props {
  /** Nome do arquivo; sem nome, o título fala em "o conteúdo". */
  fileName?: string | null;
  /** Mensagem do servidor (ou validação local). Sempre termina com "Nada do seu plano foi alterado." */
  message: string | null | undefined;
  code?: string | null;
  onRetry: () => void;
  retryLabel?: string;
  onPasteText?: () => void;
  pasteLabel?: string;
  className?: string;
}

/** Cartão de erro de importação (tela 15 do design): contorno de erro, aviso, título 14/500, mensagem 13 e duas ações de 40px. */
export function ImportErrorCard({
  fileName,
  message,
  code,
  onRetry,
  retryLabel = t("Tentar outro arquivo"),
  onPasteText,
  pasteLabel = t("Colar como texto"),
  className,
}: Props) {
  const help = importErrorHelp(code);
  const title = fileName
    ? t('Não foi possível importar "{{v0}}"', { v0: fileName })
    : t("Não foi possível importar o conteúdo");
  return (
    <Card role="alert" className={cn("gap-[10px] p-[14px] shadow-inset-error", className)}>
      <div className="flex items-start gap-[10px]">
        <Warning size={18} weight="regular" className="mt-0.5 shrink-0 text-error" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1 text-[14px]">
          <span className="block break-words font-medium">{title}</span>
          <span className="text-[13px] text-neutral-400">{withPlanUnchanged(message)}</span>
          {help ? <span className="text-[13px] text-neutral-400">{help}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className="min-h-[40px]" onClick={onRetry}>
          {retryLabel}
        </Button>
        {onPasteText ? (
          <Button variant="ghost" className="min-h-[40px]" onClick={onPasteText}>
            {pasteLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
