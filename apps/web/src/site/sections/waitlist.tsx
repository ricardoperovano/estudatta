import * as React from "react";
import { Link } from "react-router";
import { Button, Input } from "@/components/ui";
import { rawJson, errorMessage } from "@/api/client";

/** CTA de cadastro: conta gratuita direta; e-mail para avisos só se preferir. */
export function WaitlistSection() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "ok" | "error">("idle");
  const [msg, setMsg] = React.useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      await rawJson("/api/v1/public/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "site" }) });
      setState("ok");
    } catch (err) {
      setState("error");
      setMsg(errorMessage(err));
    }
  };
  return (
    <section id="cadastro" className="flex flex-col gap-4 pb-14 pt-[72px]">
      <h2 className="text-[28px] leading-[1.15]">Comece hoje, sem cartão</h2>
      <p className="max-w-[56ch] text-[15.5px] leading-[1.6] text-neutral-300">
        Crie sua conta gratuita e defina o primeiro objetivo em dois minutos. Prefere só receber novidades? Deixe seu e-mail. Sem spam, sem cobrança.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="primary" size="lg" className="px-5">
          <Link to="/cadastro">Criar conta grátis</Link>
        </Button>
      </div>
      {state === "ok" ? (
        <p className="text-[14px] text-success">Pronto. Avisamos você por e-mail quando houver novidades.</p>
      ) : (
        <form onSubmit={submit} className="flex max-w-[480px] flex-wrap gap-2">
          <Input type="email" required placeholder="voce@exemplo.com" aria-label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-[200px] flex-1" />
          <Button type="submit" variant="secondary" size="lg" loading={state === "sending"}>
            Receber novidades
          </Button>
          {state === "error" ? <span className="w-full text-[13px] text-error">{msg}</span> : null}
        </form>
      )}
    </section>
  );
}
