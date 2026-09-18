import { FilePdf, LinkSimple, MonitorPlay } from "@phosphor-icons/react";
import { Card, CardKicker, Tag } from "@/components/ui";

type Attachment = { kind: "pdf" | "video" | "link"; label: string };
interface TreeTopic {
  title: string;
  attachment?: Attachment;
}
interface TreeSubject {
  title: string;
  count: string;
  topics?: TreeTopic[];
}

const icons = {
  pdf: <FilePdf size={11} aria-hidden />,
  video: <MonitorPlay size={11} aria-hidden />,
  link: <LinkSimple size={11} aria-hidden />,
};

/** Exemplo ilustrativo de um objetivo de concurso (nomes genéricos, sem edital real). */
const example: { objective: string; count: string; subjects: TreeSubject[] } = {
  objective: "Concurso · Analista",
  count: "4 matérias",
  subjects: [
    {
      title: "Direito Constitucional",
      count: "5 tópicos",
      topics: [
        { title: "Direitos fundamentais", attachment: { kind: "pdf", label: "PDF · p. 12–34" } },
        { title: "Controle de constitucionalidade", attachment: { kind: "video", label: "Vídeo · 18 min" } },
        { title: "Organização dos Poderes", attachment: { kind: "pdf", label: "PDF · p. 35–61" } },
      ],
    },
    { title: "Direito Administrativo", count: "6 tópicos" },
    { title: "Língua Portuguesa", count: "4 tópicos" },
    { title: "Raciocínio lógico", count: "3 tópicos" },
  ],
};

/** Árvore de matérias e tópicos no visual de 03 Componentes: recuo de 16px por nível, contagem à direita, anexo como etiqueta neutra. */
export function SubjectTree() {
  return (
    <Card className="gap-2 p-5" role="img" aria-label="Exemplo ilustrativo de árvore de matérias: objetivo, matérias, tópicos e materiais com intervalo de páginas">
      <CardKicker>Árvore de matérias e tópicos</CardKicker>
      <div className="flex flex-col gap-1.5 text-[14px]">
        <div className="flex justify-between gap-3">
          <span className="font-medium">{example.objective}</span>
          <span className="text-[12px] text-neutral-400">{example.count}</span>
        </div>
        {example.subjects.map((s) => (
          <div key={s.title} className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-3 pl-4">
              <span>{s.title}</span>
              <span className="shrink-0 text-[12px] text-neutral-400">{s.count}</span>
            </div>
            {s.topics?.map((t) => (
              <div key={t.title} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-8">
                <span>{t.title}</span>
                {t.attachment ? (
                  <Tag variant="neutral" icon={icons[t.attachment.kind]} className="tnum gap-1">
                    {t.attachment.label}
                  </Tag>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      <span className="mt-1 text-[12px] text-neutral-500">Exemplo ilustrativo. As matérias e os tópicos são os do seu edital.</span>
    </Card>
  );
}
