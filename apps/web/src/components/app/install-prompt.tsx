import * as React from "react";
import { DeviceMobile, ShareNetwork } from "@phosphor-icons/react";
import { Button, Card } from "@/components/ui";
import { usePwaStore } from "@/pwa/register";
import { isIOS, isStandalone } from "@/lib/device";

/**
 * Convite de instalação coerente com o navegador: prompt nativo quando existe,
 * instruções manuais no iOS (Compartilhar → Adicionar à Tela de Início).
 */
export function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const prompt = usePwaStore((s) => s.installPrompt);
  const set = usePwaStore((s) => s.set);
  const [standalone, setStandalone] = React.useState(true);
  const [ios, setIos] = React.useState(false);
  React.useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIOS());
  }, []);
  if (standalone) return null;
  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") set({ installPrompt: null });
  };
  if (prompt) {
    return (
      <Card className={compact ? "flex-row items-center justify-between gap-3 p-3" : "gap-2 p-4"}>
        <div className="flex items-center gap-2 text-[14px]">
          <DeviceMobile size={20} className="text-accent" aria-hidden />
          <span>Instale o Estudatta para abrir direto da tela inicial.</span>
        </div>
        <Button variant="primary" size="md" onClick={install}>
          Instalar
        </Button>
      </Card>
    );
  }
  if (ios) {
    return (
      <Card className="gap-2 p-4 text-[14px]">
        <div className="flex items-center gap-2">
          <ShareNetwork size={20} className="text-accent" aria-hidden />
          <span className="font-medium">Adicionar à tela inicial</span>
        </div>
        <p className="text-neutral-400">
          No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. Assim o app abre em tela cheia e pode receber lembretes.
        </p>
      </Card>
    );
  }
  return null;
}
