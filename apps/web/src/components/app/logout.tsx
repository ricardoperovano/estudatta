/**
 * Sair da conta, de qualquer lugar (menu de perfil, Preferências). Se há registros feitos neste
 * aparelho ainda não sincronizados, pergunta antes: sincronizar e sair, descartar e sair, ou
 * continuar. Ao sair, o cache privado deste aparelho é apagado.
 */
import * as React from "react";
import { useNavigate } from "react-router";
import { useAuthActions, useUser } from "@/api/session";
import { Banner, Button, Dialog, DialogContent } from "@/components/ui";
import { syncNow, useSyncStore } from "@/offline/sync";

export function useLogoutFlow(online: boolean) {
  const user = useUser();
  const { logout } = useAuthActions();
  const nav = useNavigate();
  const sync = useSyncStore();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<"sync" | "discard" | "plain" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const waiting = sync.pending + sync.conflicts;

  const doLeave = async (kind: "discard" | "plain") => {
    setBusy(kind);
    await logout();
    nav("/entrar", { replace: true });
  };

  const syncAndLeave = async () => {
    if (!user) return;
    setBusy("sync");
    setError(null);
    const ok = await syncNow(user.id);
    const s = useSyncStore.getState();
    if (ok && s.pending === 0 && s.conflicts === 0) {
      await logout();
      nav("/entrar", { replace: true });
      return;
    }
    setBusy(null);
    setError(
      s.status === "offline"
        ? "Sem conexão: não deu para sincronizar agora. Você pode esperar a internet voltar ou sair descartando os registros."
        : s.conflicts > 0
          ? "Alguns registros precisam da sua decisão em Sincronização antes de serem enviados."
          : "Não foi possível sincronizar agora. Nada foi perdido; tente de novo em instantes.",
    );
  };

  /** Chame ao clicar em "Sair": sai na hora ou abre a pergunta sobre registros pendentes. */
  const leave = () => (waiting > 0 ? setOpen(true) : void doLeave("plain"));

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => busy === null && setOpen(o)}>
      <DialogContent
        mode="sheet"
        title="Há registros ainda não sincronizados"
        description={`${waiting} ${waiting === 1 ? "registro feito" : "registros feitos"} neste aparelho ainda não ${waiting === 1 ? "chegou" : "chegaram"} à sua conta. Ao sair, os dados deste aparelho são apagados.`}
      >
        {error ? <Banner kind="error">{error}</Banner> : null}
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" block loading={busy === "sync"} disabled={!online || busy !== null} onClick={() => void syncAndLeave()}>
            Sincronizar e sair
          </Button>
          <Button variant="danger" size="lg" block loading={busy === "discard"} disabled={busy !== null} onClick={() => void doLeave("discard")}>
            Descartar {waiting === 1 ? "o registro" : "os registros"} e sair
          </Button>
          <Button variant="ghost-muted" size="lg" block disabled={busy !== null} onClick={() => setOpen(false)}>
            Continuar conectado
          </Button>
        </div>
        {!online ? <p className="text-[12px] text-neutral-400">Sem conexão: sincronizar só será possível quando a internet voltar.</p> : null}
      </DialogContent>
    </Dialog>
  );

  return { leave, dialog, busy };
}
