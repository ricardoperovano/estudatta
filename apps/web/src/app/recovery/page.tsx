import { t } from "@/i18n";
import { Link, useParams } from "react-router";
import { CaretLeft } from "@phosphor-icons/react";
import { EmptyState, Button } from "@/components/ui";
import { RecoveryPlanner } from "@/components/app/recovery-planner";
import { useActivity, useBalance } from "@/api/queries";
import { usePageTour } from "@/components/tour/use-tours";
import { recuperacaoTour } from "@/tours/recuperacao";

/** Tela 09: recuperação de tempo pendente e replanejamento do objetivo. */
export default function RecoveryPage() {
  const { id } = useParams();
  // mesmas consultas do planejador (o React Query reaproveita): o tour espera a tela carregar
  const activity = useActivity(id);
  const balance = useBalance(id, 14);
  usePageTour(recuperacaoTour, !!id && activity.isSuccess && balance.isSuccess);
  if (!id) {
    return (
      <EmptyState
        title={t("Objetivo não encontrado.")}
        action={
          <Button asChild>
            <Link to="/app/objetivos">{t("Ver objetivos")}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-160px)] w-full max-w-[560px] flex-col gap-[14px] desktop:min-h-0">
      <Link
        to={`/app/objetivos/${id}`}
        className="inline-flex min-h-[32px] items-center gap-1 self-start text-[13px] text-neutral-400 no-underline hover:text-primary"
      >
        <CaretLeft size={14} aria-hidden /> {t("Voltar ao objetivo")}
      </Link>
      <div className="flex flex-1 flex-col [&>div]:flex-1">
        <RecoveryPlanner activityId={id} />
      </div>
    </div>
  );
}
