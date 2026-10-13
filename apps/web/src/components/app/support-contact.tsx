/**
 * Contato do suporte. O endereço vem de `brand.supportEmail` (um lugar só) e aparece sempre
 * escrito na tela: no celular o link `mailto:` nem sempre abre um aplicativo de e-mail, então a
 * pessoa ainda consegue ler e copiar o endereço.
 */
import * as React from "react";
import { Check, Copy, EnvelopeSimple } from "@phosphor-icons/react";
import { Button, Card, toast } from "@/components/ui";
import { brand } from "@/design/brand";
import { t } from "@/i18n";

/** `mailto:` com assunto preenchido, para a mensagem já chegar identificada. */
export function supportMailto(subject?: string): string {
  const s = subject ?? t("Ajuda no Estudatta");
  return `mailto:${brand.supportEmail}?subject=${encodeURIComponent(s)}`;
}

/** Só o endereço, clicável — para rodapés e telas de erro. */
export function SupportEmailLink({ subject, className }: { subject?: string; className?: string }) {
  return (
    <a href={supportMailto(subject)} className={className}>
      {brand.supportEmail}
    </a>
  );
}

export function CopySupportEmailButton() {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brand.supportEmail);
      setCopied(true);
      toast("success", t("E-mail copiado"));
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("info", t("Não deu para copiar sozinho"), brand.supportEmail);
    }
  };
  return (
    <Button variant="secondary" size="md" onClick={copy} className="self-start">
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? t("Copiado") : t("Copiar e-mail")}
    </Button>
  );
}

/** Bloco de contato em Preferências › Ajuda. */
export function SupportContactCard() {
  return (
    <Card className="gap-2 p-[14px] text-[14px]" data-tour="preferencias-contato">
      <span>{t("Falar com a gente")}</span>
      <span className="text-[12px] text-neutral-400">
        {t("Dúvida, problema ou sugestão: escreva e a gente responde por e-mail.")}
      </span>
      <a
        href={supportMailto()}
        className="inline-flex min-h-[40px] items-center gap-2 self-start font-medium break-all"
      >
        <EnvelopeSimple size={16} aria-hidden /> {brand.supportEmail}
      </a>
      <CopySupportEmailButton />
    </Card>
  );
}
