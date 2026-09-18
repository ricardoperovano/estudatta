import * as React from "react";
import { Link } from "react-router";
import { Container } from "../layout";
import { Seo, pageMeta } from "../seo";
import { Banner, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { rawJson, errorMessage, isNetworkError } from "@/api/client";
import { brand } from "@/design/brand";

const subjects = ["Dúvida sobre o app", "Problema técnico", "Planos e cobrança", "Privacidade e dados", "Outro assunto"];
const MAX_MESSAGE = 4000;

type State = "idle" | "sending" | "ok" | "error";

/** Contato: formulário enviado ao servidor (POST /api/v1/public/contact) e e-mail de suporte como alternativa. */
export default function ContatoPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [subject, setSubject] = React.useState(subjects[0]);
  const [message, setMessage] = React.useState("");
  const [state, setState] = React.useState<State>("idle");
  const [error, setError] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await rawJson<{ ok?: boolean; message?: string | null }>("/api/v1/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, email: email.trim(), subject, message: message.trim() }),
      });
      if (res && res.ok === false) {
        setError(res.message || "Não foi possível enviar a mensagem.");
        setState("error");
        return;
      }
      setConfirmation(res?.message || "Mensagem recebida.");
      setState("ok");
      setMessage("");
    } catch (err) {
      setError(isNetworkError(err) ? "Sem conexão com o servidor. Sua mensagem continua no formulário; tente de novo em instantes." : errorMessage(err));
      setState("error");
    }
  };

  return (
    <>
      <Seo {...pageMeta["/contato"]} />
      <Container>
        <section className="grid items-start gap-12 pb-24 pt-[clamp(56px,10vw,112px)] tablet:grid-cols-[minmax(0,1fr)_minmax(320px,520px)]">
          <div className="flex flex-col gap-6">
            <span className="text-[13px] uppercase tracking-[0.06em] text-accent">Contato</span>
            <h1 className="text-[clamp(40px,6vw,80px)] leading-[1.08] tracking-[-0.015em]">Fale com a gente.</h1>
            <p className="max-w-[48ch] text-[17px] leading-[1.6] text-neutral-300">
              Dúvida, problema ou sugestão: escreva pelo formulário ou direto para{" "}
              <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
            </p>
            <p className="max-w-[48ch] text-[14px] leading-[1.6] text-neutral-400">
              Talvez a resposta já esteja nas <Link to="/faq">perguntas frequentes</Link>. Sobre o tratamento dos seus dados, veja a <Link to="/privacidade">política de privacidade</Link>.
            </p>
          </div>

          {state === "ok" ? (
            <div className="flex flex-col gap-4 rounded-lg bg-surface p-6 shadow-md">
              <Banner kind="synced">{confirmation}</Banner>
              <Button type="button" variant="secondary" size="lg" className="self-start" onClick={() => setState("idle")}>
                Enviar outra mensagem
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg bg-surface p-6 shadow-md" aria-label="Formulário de contato">
              <Field label="Nome (opcional)" htmlFor="ct-name">
                <Input id="ct-name" name="name" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="E-mail" htmlFor="ct-email">
                <Input id="ct-email" name="email" type="email" required autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Assunto" htmlFor="ct-subject">
                <Select id="ct-subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {subjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Mensagem" htmlFor="ct-message" hint={`${message.length} de ${MAX_MESSAGE} caracteres. Não envie senhas nem dados de pagamento.`}>
                <Textarea id="ct-message" name="message" required rows={6} maxLength={MAX_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} />
              </Field>
              {state === "error" ? (
                <Banner kind="error">
                  {error} Se preferir, escreva para <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
                </Banner>
              ) : null}
              <Button type="submit" variant="primary" size="lg" loading={state === "sending"} disabled={state === "sending"} className="self-start px-5">
                {state === "sending" ? "Enviando…" : "Enviar mensagem"}
              </Button>
            </form>
          )}
        </section>
      </Container>
    </>
  );
}
