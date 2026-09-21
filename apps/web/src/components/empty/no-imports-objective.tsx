/**
 * Importar sem nenhum objetivo: explica o caminho (objetivo → enviar → revisar → confirmar)
 * e mostra, apagada, uma proposta de exemplo com matérias e tópicos.
 */
import { t as tx } from "@/i18n";
import { Link } from "react-router";
import { CheckCircle, ClipboardText, FileArrowUp, MagnifyingGlass, Target } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { EmptyHero } from "./empty-hero";
import { ExamplePreview } from "./example-preview";
import { Explainer } from "./explainer";

const PROPOSAL = [
  {
    subject: tx("Língua Portuguesa"),
    topics: [tx("Interpretação de texto"), tx("Crase"), tx("Concordância verbal")],
  },
  { subject: tx("Matemática"), topics: [tx("Porcentagem"), tx("Juros simples e compostos")] },
  { subject: tx("Noções de informática"), topics: [tx("Planilhas"), tx("Segurança da informação")] },
];

export function NoImportsObjective() {
  return (
    <div className="grid gap-4 desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-6">
      <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
        <EmptyHero
          kicker={tx("Primeiro, um objetivo")}
          title={tx("O conteúdo importado mora dentro de um objetivo")}
          mood="think"
          icon={FileArrowUp}
          actions={
            <>
              <Button asChild variant="primary" size="lg" className="bg-surface">
                <Link to="/app/objetivos/novo?categoria=concurso">{tx("+ Criar objetivo")}</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="bg-surface">
                <Link to="/app/objetivos">{tx("Ver modelos")}</Link>
              </Button>
            </>
          }
        >
          <p className="m-0">
            {tx(
              "Crie o objetivo (um concurso, uma disciplina, um curso) e volte aqui para trazer o edital ou o sumário de uma vez, sem digitar matéria por matéria.",
            )}
          </p>
        </EmptyHero>
        <Explainer
          title={tx("Como funciona")}
          numbered
          items={[
            {
              icon: Target,
              title: tx("Escolha o objetivo"),
              body: tx("É nele que as matérias e os tópicos vão entrar."),
              tint: "accent",
            },
            {
              icon: ClipboardText,
              title: tx("Cole o texto, envie um CSV ou um PDF"),
              body: tx("Edital, sumário do livro ou a sua própria lista."),
              tint: "info",
            },
            {
              icon: MagnifyingGlass,
              title: tx("Revise a proposta"),
              body: tx("Edite títulos, páginas e minutos e remova o que não serve."),
              tint: "warning",
            },
            {
              icon: CheckCircle,
              title: tx("Confirme"),
              body: tx("Só então tudo entra no seu objetivo. Nada é criado antes."),
              tint: "success",
            },
          ]}
        />
      </div>
      <ExamplePreview
        className="desktop:self-start"
        title={tx("Assim fica a proposta")}
        summary={tx(
          "proposta com três matérias: Língua Portuguesa com Interpretação de texto, Crase e Concordância verbal; Matemática com Porcentagem e Juros; Noções de informática com Planilhas e Segurança da informação.",
        )}
        note={tx("Você confere cada matéria e tópico antes de confirmar.")}
      >
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {PROPOSAL.map((p) => (
            <li key={p.subject} className="rounded-md bg-surface px-3 py-2.5 shadow-sm">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium">{p.subject}</span>
                <span className="tnum text-[12px] text-neutral-400">
                  {tx("{{v0}} tópicos", { v0: p.topics.length })}
                </span>
              </span>
              <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 border-l-2 border-accent-800 p-0 pl-3">
                {p.topics.map((t) => (
                  <li key={t} className="text-[13px] text-neutral-300">
                    {t}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </ExamplePreview>
    </div>
  );
}
