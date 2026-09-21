import { t } from "@/i18n";
import * as React from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { Button, toast } from "@/components/ui";

/** Copia o link da página de instalação (para colar no Safari / navegador de verdade). */
export function CopyLinkButton({ path = "/app/instalar" }: { path?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("success", t("Link copiado. Agora é só colar no navegador."));
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("info", t("Não deu para copiar sozinho"), url);
    }
  };
  return (
    <Button variant="secondary" size="md" onClick={copy} className="self-start">
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? t("Copiado") : t("Copiar link")}
    </Button>
  );
}
