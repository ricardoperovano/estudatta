import { Plus } from "@phosphor-icons/react";

export const faqItems = [
  { q: "O app ensina inglês ou tem conteúdo de concurso?", a: "Não. Ele organiza o estudo que você faz em cursos, livros, vídeos e aulas, e acompanha o tempo dedicado a cada parte." },
  { q: "O que acontece quando eu não registro um dia?", a: "O tempo da meta entra como pendência, conforme a regra que você escolheu: distribuir nos próximos dias, acumular e decidir depois, ou só avisar. Você pode registrar depois se estudou e esqueceu." },
  { q: "Funciona sem internet?", a: "Sim. Sessões ficam salvas no aparelho e sincronizam quando você voltar à internet. Login, pagamento e importação de arquivos precisam de conexão." },
  { q: "Preciso instalar algo?", a: "Não. Abre no navegador e pode ser adicionado à tela inicial do celular ou do computador como um app." },
  { q: "O relatório diz se estou aprendendo?", a: "Não. Ele mostra constância e tempo por objetivo. Aprendizado se mede nos seus próprios exercícios, provas e conversas." },
  { q: "Os lembretes tocam com a tela bloqueada?", a: "Os lembretes usam notificações do navegador ou do app instalado. No iPhone e iPad, é preciso adicionar o app à tela inicial e permitir notificações. O sistema pode atrasar entregas; não prometemos alarme exato." },
  { q: "Posso cancelar quando quiser?", a: "Sim. O cancelamento é feito na tela de planos, sem obstáculos. Seu histórico e a exportação dos seus dados continuam disponíveis." },
];

export function FaqSection({ items = faqItems.slice(0, 5), title = "O que o app faz — e o que não faz" }: { items?: typeof faqItems; title?: string }) {
  return (
    <section id="faq" className="grid gap-8 pb-24 tablet:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
      <div>
        <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Perguntas</span>
        <h2 className="mt-3 text-[32px] leading-[1.15]">{title}</h2>
      </div>
      <div className="flex flex-col">
        {items.map((it, i) => (
          <details key={it.q} className={"border-t border-neutral-800 py-4" + (i === items.length - 1 ? " border-b" : "")}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
              {it.q}
              <Plus size={16} className="shrink-0 text-accent" aria-hidden />
            </summary>
            <p className="mt-[10px] text-[15px] leading-[1.6] text-neutral-300">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
