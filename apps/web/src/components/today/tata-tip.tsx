/** "Dica do Tatá": uma dica curta e útil sobre o app por dia, com a opção de ver outra. */
import * as React from "react";
import { Link } from "react-router";
import { ArrowRight, ArrowsClockwise, Lightbulb } from "@phosphor-icons/react";
import { TataSvg, type TataMood } from "@/components/mascot/TataSvg";
import { useTataPrefs } from "@/components/mascot/use-tata";
import { cn } from "@/lib/utils";

interface Tip {
  title: string;
  body: string;
  link?: { to: string; label: string };
  mood: TataMood;
  /** só faz sentido com um objetivo criado */
  needsObjective?: boolean;
  /** fala do próprio Tatá (some quando o mascote está desligado) */
  needsMascot?: boolean;
}

const TATA_TIPS: Tip[] = [
  {
    title: "Revisões no automático",
    body: "Depois de estudar um tópico, as revisões são agendadas sozinhas. As que vencem hoje aparecem aqui na tela Hoje.",
    link: { to: "/app/revisoes", label: "Ver revisões" },
    mood: "think",
  },
  {
    title: "Estudou sem o cronômetro?",
    body: "Tudo bem! Dá para registrar depois, com a duração e o tipo de estudo. Vale para ontem também.",
    link: { to: "/app?registrar=1", label: "Registrar tempo" },
    mood: "encourage",
    needsObjective: true,
  },
  {
    title: "Pausa planejada",
    body: "Viagem, semana de provas ou uns dias doente? Marque uma pausa no objetivo: nada vira pendência e os lembretes ficam em silêncio.",
    link: { to: "/app/objetivos", label: "Ver objetivos" },
    mood: "paused",
  },
  {
    title: "Recuperar sem culpa",
    body: "Se um dia ficar para trás, o tempo pode ser distribuído nos próximos dias, aos pouquinhos. Ninguém precisa compensar tudo de uma vez.",
    mood: "love",
  },
  {
    title: "Seus materiais num lugar só",
    body: "Guarde PDFs, links e livros e vincule cada um ao tópico, com as páginas. Fica fácil saber de onde continuar.",
    link: { to: "/app/materiais", label: "Abrir materiais" },
    mood: "focus",
  },
  {
    title: "A semana inteira de uma vez",
    body: "No Plano você vê os blocos de cada dia e pode imprimir a semana para deixar na mesa.",
    link: { to: "/app/plano", label: "Abrir o plano" },
    mood: "idle",
  },
  {
    title: "Do seu jeito",
    body: "Prefere um Tatá mais direto ou mais firme? O tom das falas e dos lembretes muda em Preferências.",
    link: { to: "/app/preferencias", label: "Preferências" },
    mood: "wave",
  },
  {
    title: "Pausas contam a favor",
    body: "Durante a sessão, eu comemoro cada 25 minutos de foco. Aproveita para esticar as costas e beber água: o tempo pausado não conta, mas nada do que foi feito se perde.",
    mood: "paused",
    needsMascot: true,
  },
  {
    title: "Carinho faz bem",
    body: "Toque em mim de vez em quando! E se a tela ficar parada, eu tiro um cochilo.",
    mood: "love",
    needsMascot: true,
  },
];

function dayIndex(): number {
  const d = new Date();
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);
}

export function TataTip({ hasObjective, className }: { hasObjective: boolean; className?: string }) {
  const { enabled } = useTataPrefs();
  const tips = React.useMemo(() => TATA_TIPS.filter((t) => (hasObjective || !t.needsObjective) && (enabled || !t.needsMascot)), [hasObjective, enabled]);
  const [i, setI] = React.useState(() => dayIndex());
  const tip = tips[i % tips.length];
  return (
    <section aria-labelledby="dica-tata" className={cn("tip-soft rise-in relative flex gap-3 overflow-hidden rounded-[20px] p-4 shadow-sm", className)}>
      {enabled ? (
        <TataSvg mood={tip.mood} size={52} className="relative shrink-0 self-start" />
      ) : (
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning-tint text-pending" aria-hidden>
          <Lightbulb size={20} weight="fill" />
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="kicker-pending flex items-center gap-1">
            <Lightbulb size={12} weight="fill" aria-hidden />
            {enabled ? "Dica do Tatá" : "Dica"}
          </span>
          <button
            type="button"
            onClick={() => setI(i + 1)}
            className="-mr-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-neutral-400 hover:text-primary"
            aria-label="Ver outra dica"
          >
            <ArrowsClockwise size={13} aria-hidden />
            Outra
          </button>
        </div>
        <h2 id="dica-tata" className="mt-1 text-[15px] font-medium leading-[1.25]">
          {tip.title}
        </h2>
        <p aria-live="polite" className="mt-1 text-[13px] leading-[1.45] text-neutral-300">
          {tip.body}
        </p>
        {tip.link ? (
          <Link to={tip.link.to} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium no-underline hover:underline">
            {tip.link.label}
            <ArrowRight size={12} aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
