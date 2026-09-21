/**
 * Materiais sem nada guardado: convite, três jeitos de adicionar (cada um abre o formulário
 * no tipo certo) e um cartão de exemplo apagado.
 */
import { t } from "@/i18n";
import { BookBookmark, Books, FilePdf, LinkSimple, type Icon } from "@phosphor-icons/react";
import { Tag } from "@/components/ui";
import { cn } from "@/lib/utils";
import { EmptyHero } from "./empty-hero";
import { ExamplePreview } from "./example-preview";

type Kind = "pdf" | "link" | "physical";

const KINDS: { kind: Kind; icon: Icon; title: string; hint: string; tint: string }[] = [
  {
    kind: "pdf",
    icon: FilePdf,
    title: "PDF",
    hint: t("Apostila, edital, slides da aula"),
    tint: "bg-error-tint text-error",
  },
  {
    kind: "link",
    icon: LinkSimple,
    title: t("Link"),
    hint: t("Vídeo, curso on-line, artigo"),
    tint: "bg-info-tint text-info",
  },
  {
    kind: "physical",
    icon: BookBookmark,
    title: t("Livro físico"),
    hint: t("Anote as páginas e onde parou"),
    tint: "bg-success-tint text-success",
  },
];

export function NoMaterials({ filtered, onAdd }: { filtered?: boolean; onAdd: (kind: Kind) => void }) {
  return (
    <div className="grid gap-4 desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-6">
      <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
        <EmptyHero
          kicker={filtered ? t("Nada neste objetivo") : t("Seus materiais")}
          title={
            filtered ? t("Nenhum material neste objetivo ainda") : t("Tudo o que você estuda, num lugar só")
          }
          mood="focus"
          icon={Books}
        >
          <p className="m-0">
            {t(
              "Guarde PDFs, links e livros e vincule cada um aos tópicos, com as páginas. Na hora de estudar, você sabe de onde continuar.",
            )}
          </p>
        </EmptyHero>
        <section aria-labelledby="tipos-material" className="rise-in flex flex-col gap-3">
          <h2 id="tipos-material" className="text-[15px] font-medium">
            {t("O que você quer guardar?")}
          </h2>
          <ul className="m-0 grid list-none gap-2.5 p-0 tablet:grid-cols-3">
            {KINDS.map((k) => {
              const I = k.icon;
              return (
                <li key={k.kind} className="grid">
                  <button
                    type="button"
                    onClick={() => onAdd(k.kind)}
                    className="group flex min-h-[64px] items-center gap-3 rounded-[16px] bg-surface p-3 text-left shadow-sm transition-shadow duration-base hover:shadow-md tablet:flex-col tablet:items-start"
                  >
                    <span
                      className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[12px]", k.tint)}
                      aria-hidden
                    >
                      <I size={20} weight="duotone" />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block text-[14px] font-medium">
                        {t("Adicionar {{v0}}", {
                          v0: k.title === "Livro físico" ? t("livro físico") : k.title,
                        })}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-neutral-400">{k.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <ExamplePreview
        className="desktop:self-start"
        title={t("Assim fica um material")}
        summary={t(
          "PDF Gramática essencial, páginas 12 a 30, do objetivo Inglês, com 3 tópicos vinculados e anotado onde parou: página 18.",
        )}
        note={t(
          "Toque no material para abrir, anotar onde parou e ligar aos tópicos com o intervalo de páginas.",
        )}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 rounded-md bg-surface px-[14px] py-3 text-[14px] shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{t("Gramática essencial · PDF")}</span>
              <Tag variant="neutral" className="tnum shrink-0">
                p. 12–30
              </Tag>
            </div>
            <span className="text-[12px] text-neutral-400">{t("Inglês · 3 tópicos vinculados")}</span>
            <span className="text-[12px] text-neutral-400">{t("Parei em: p. 18")}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md bg-surface px-[14px] py-3 text-[14px] shadow-sm">
            <span className="min-w-0 truncate">{t("Aula de listening · Link")}</span>
            <span className="text-[12px] text-neutral-400">{t("Inglês · 1 tópico vinculado")}</span>
          </div>
        </div>
      </ExamplePreview>
    </div>
  );
}
