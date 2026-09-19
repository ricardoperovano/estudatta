/**
 * Comemoração de conquistas novas: aparece uma vez por conquista (depois fica "vista"), nunca
 * durante o cronômetro e nem na própria página de Conquistas. O Tatá pula junto, se estiver ligado.
 */
import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { Button, Dialog, DialogActions, DialogContent } from "@/components/ui";
import { useGamification, useMarkAchievementsSeen } from "@/api/study";
import { useUser } from "@/api/session";
import { TataSvg } from "@/components/mascot/TataSvg";
import { useTataPrefs } from "@/components/mascot/use-tata";
import { AchievementBadge } from "./achievement-icon";

export function AchievementCelebration() {
  const user = useUser();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const g = useGamification();
  const seen = useMarkAchievementsSeen();
  const { enabled: tata } = useTataPrefs();
  const [dismissed, setDismissed] = React.useState<string>("");

  const unseen = g.data?.unseen ?? [];
  const key = unseen.map((a) => a.code).join(",");
  const blocked = pathname.startsWith("/app/sessao") || pathname.startsWith("/app/conquistas") || !user?.onboarding_completed_at;
  const open = unseen.length > 0 && !blocked && dismissed !== key;
  if (!open) return null;

  const close = (goTo?: string) => {
    setDismissed(key);
    seen.mutate(unseen.map((a) => a.code));
    if (goTo) nav(goTo);
  };
  const shown = unseen.slice(0, 3);
  const more = unseen.length - shown.length;
  const title = unseen.length === 1 ? "Conquista nova!" : `${unseen.length} conquistas novas!`;

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent title={title} description="Veio direto dos seus registros. Conquistas não são retiradas.">
        <div className="flex flex-col items-center gap-3">
          {tata ? <TataSvg mood="cheer" size={110} /> : null}
          <ul className="m-0 flex w-full list-none flex-col gap-2 p-0">
            {shown.map((a) => (
              <li key={a.code} className="flex items-center gap-3 rounded-md bg-surface p-3">
                <AchievementBadge icon={a.icon} unlocked size={40} />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[14px] font-medium">{a.title}</span>
                  <span className="text-[12px] text-neutral-400">{a.description}</span>
                </div>
              </li>
            ))}
          </ul>
          {more > 0 ? <span className="text-[13px] text-neutral-400">e mais {more}.</span> : null}
        </div>
        <DialogActions>
          <Button variant="ghost" onClick={() => close()}>
            Fechar
          </Button>
          <Button variant="primary" onClick={() => close("/app/conquistas")}>
            Ver conquistas
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
