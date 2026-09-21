/** Painel administrativo — campanhas de e-mail (rascunho → teste → envio para um segmento). */
import { t as tx } from "@/i18n";
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CaretLeft, Plus } from "@phosphor-icons/react";
import {
  useAdminCampaigns,
  useAdminCoupons,
  useCampaignSegments,
  useCreateCampaign,
  useDeleteCampaign,
  useSendCampaign,
  useTestCampaign,
  useUpdateCampaign,
  type Campaign,
  type CampaignIn,
} from "@/api/admin-growth";
import { errorMessage } from "@/api/client";
import { useUser } from "@/api/session";
import {
  TEMPLATES,
  couponSummary,
  defaultCtaUrl,
  renderPreview,
  type CampaignTemplate,
} from "@/components/app/admin-growth-format";
import { fmtDate } from "@/components/app/admin-format";
import { AdminSection, AdminTitle, QueryGate } from "@/components/app/admin-shared";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button, Card, EmptyState, Field, Input, Select, Tag, Textarea, toast } from "@/components/ui";

const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
const SAMPLE_NAME = "Ana";

// --- Lista -------------------------------------------------------------------------------------

export function AdminCampaignsPage() {
  const campaigns = useAdminCampaigns();
  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title={tx("Campanhas")}
        subtitle={tx(
          "E-mails para um segmento de usuários. Rascunhos podem ser editados e testados; o envio é único e fica na auditoria.",
        )}
        actions={
          <Button size="lg" asChild>
            <Link to="/admin/campanhas/nova">
              <Plus size={16} aria-hidden /> {tx("Nova campanha")}
            </Link>
          </Button>
        }
      />
      <AdminSection
        title={tx("Todas as campanhas")}
        meta={
          campaigns.data ? (
            <span className="tnum">
              {tx("{{v0}} no total", { v0: campaigns.data.length.toLocaleString("pt-BR") })}
            </span>
          ) : null
        }
      >
        <QueryGate query={campaigns}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title={tx("Nenhuma campanha ainda.")}
                description={tx("Crie um rascunho, envie um teste para você e depois para o segmento.")}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.1em] text-neutral-400">
                      <th scope="col" className="py-2 pr-3 font-normal">
                        {tx("Nome")}
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        {tx("Segmento")}
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        {tx("Situação")}
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        {tx("Destinatários")}
                      </th>
                      <th scope="col" className="py-2 pr-3 font-normal">
                        {tx("Enviada em")}
                      </th>
                      <th scope="col" className="py-2 font-normal">
                        {tx("Criada em")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.id} className="border-t border-divider align-top">
                        <td className="py-2 pr-3">
                          <Link
                            to={`/admin/campanhas/${c.id}`}
                            className="text-[14px] font-medium text-accent"
                          >
                            {c.name}
                          </Link>
                          <span className="block max-w-[320px] truncate text-[12px] text-neutral-400">
                            {c.subject}
                          </span>
                        </td>
                        <td className="max-w-[260px] py-2 pr-3">{c.segment_label}</td>
                        <td className="py-2 pr-3">
                          <CampaignStatusTag status={c.status} />
                        </td>
                        <td className="tnum py-2 pr-3">
                          {c.status === "sent" ? c.recipients.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="tnum whitespace-nowrap py-2 pr-3">{fmtDate(c.sent_at)}</td>
                        <td className="tnum whitespace-nowrap py-2">{fmtDate(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </QueryGate>
      </AdminSection>
    </div>
  );
}

function CampaignStatusTag({ status }: { status: string }) {
  if (status === "sent") return <Tag variant="success">{tx("Enviada")}</Tag>;
  if (status === "draft") return <Tag variant="neutral">{tx("Rascunho")}</Tag>;
  return <Tag variant="neutral">{status}</Tag>;
}

// --- Editor ------------------------------------------------------------------------------------

interface Draft {
  name: string;
  segment: string;
  subject: string;
  body: string;
  cta_label: string;
  cta_url: string;
  coupon_code: string;
}

const EMPTY: Draft = {
  name: "",
  segment: "",
  subject: "",
  body: "",
  cta_label: "",
  cta_url: "",
  coupon_code: "",
};

function toDraft(c: Campaign): Draft {
  return {
    name: c.name,
    segment: c.segment,
    subject: c.subject,
    body: c.body,
    cta_label: c.cta_label ?? "",
    cta_url: c.cta_url ?? "",
    coupon_code: c.coupon_code ?? "",
  };
}

function toBody(d: Draft): CampaignIn {
  return {
    name: d.name.trim(),
    segment: d.segment,
    subject: d.subject.trim(),
    body: d.body.trim(),
    cta_label: d.cta_label.trim() || null,
    cta_url: d.cta_url.trim() || null,
    coupon_code: d.coupon_code || null,
  };
}

export function AdminCampaignEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === "nova";
  const campaigns = useAdminCampaigns();

  if (isNew) return <EditorFrame campaign={null} />;
  return (
    <QueryGate query={campaigns}>
      {(list) => {
        const c = list.find((x) => x.id === id);
        if (!c) {
          return (
            <div className="flex flex-col gap-[14px] desktop:gap-6">
              <BackLink />
              <EmptyState
                title={tx("Campanha não encontrada.")}
                description={tx("Ela pode ter sido apagada.")}
              />
            </div>
          );
        }
        return <EditorFrame key={`${c.id}:${c.status}`} campaign={c} />;
      }}
    </QueryGate>
  );
}

function BackLink() {
  return (
    <Link
      to="/admin/campanhas"
      className="inline-flex min-h-[44px] items-center gap-1 self-start text-[14px] text-accent"
    >
      <CaretLeft size={16} aria-hidden /> {tx("Campanhas")}
    </Link>
  );
}

function EditorFrame({ campaign }: { campaign: Campaign | null }) {
  const navigate = useNavigate();
  const me = useUser();
  const segments = useCampaignSegments();
  const coupons = useAdminCoupons();
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const test = useTestCampaign();
  const send = useSendCampaign();
  const remove = useDeleteCampaign();

  const [draft, setDraft] = React.useState<Draft>(campaign ? toDraft(campaign) : EMPTY);
  const [touched, setTouched] = React.useState(false);
  const [confirmSend, setConfirmSend] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const sent = campaign?.status === "sent";
  const saved = campaign ? toDraft(campaign) : null;
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const segment = (segments.data ?? []).find((s) => s.key === draft.segment);
  const couponList = (coupons.data ?? []).filter((c) => c.active);
  const selectedCoupon = couponList.find((c) => c.code === draft.coupon_code);
  const couponMissing = !!draft.coupon_code && !!coupons.data && !selectedCoupon;

  const nameError =
    draft.name.trim().length < 2
      ? tx("Dê um nome (mínimo 2 caracteres).")
      : draft.name.trim().length > 120
        ? tx("Máximo de 120 caracteres.")
        : null;
  const segmentError = draft.segment ? null : tx("Escolha um segmento.");
  const subjectError =
    draft.subject.trim().length < 2
      ? tx("Escreva o assunto (mínimo 2 caracteres).")
      : draft.subject.trim().length > 160
        ? tx("Máximo de 160 caracteres.")
        : null;
  const bodyError =
    draft.body.trim().length < 10
      ? tx("Escreva o corpo (mínimo 10 caracteres).")
      : draft.body.trim().length > 8000
        ? tx("Máximo de 8000 caracteres.")
        : null;
  const ctaUrlT = draft.cta_url.trim();
  const ctaUrlError =
    ctaUrlT && !/^https?:\/\/\S+$/i.test(ctaUrlT)
      ? tx("Use um endereço completo, começando com https://.")
      : ctaUrlT.length > 400
        ? tx("Máximo de 400 caracteres.")
        : null;
  const ctaLabelError = draft.cta_label.trim().length > 60 ? tx("Máximo de 60 caracteres.") : null;
  const usesCoupon = draft.body.includes("{cupom}") || draft.subject.includes("{cupom}");
  const couponWarning =
    usesCoupon && !draft.coupon_code
      ? tx("O texto usa {cupom}, mas nenhum cupom foi escolhido: o espaço ficará vazio no e-mail.")
      : null;
  const invalid = !!(nameError || segmentError || subjectError || bodyError || ctaUrlError || ctaLabelError);

  const save = async (): Promise<Campaign | null> => {
    setTouched(true);
    if (invalid) {
      toast("error", tx("Revise os campos destacados"));
      return null;
    }
    try {
      if (!campaign) {
        const c = await create.mutateAsync(toBody(draft));
        toast("success", tx("Rascunho salvo"));
        void navigate(`/admin/campanhas/${c.id}`, { replace: true });
        return c;
      }
      const c = await update.mutateAsync({ id: campaign.id, body: toBody(draft) });
      toast("success", tx("Rascunho salvo"));
      return c;
    } catch (e) {
      toast("error", tx("Não foi possível salvar"), errorMessage(e));
      return null;
    }
  };

  /** Garante que o servidor tem a versão atual antes de testar/enviar. */
  const ensureSaved = async (): Promise<Campaign | null> => {
    if (campaign && !dirty) return campaign;
    return save();
  };

  const doTest = async () => {
    const c = await ensureSaved();
    if (!c) return;
    try {
      await test.mutateAsync(c.id);
      toast(
        "success",
        tx("Enviado para o seu e-mail"),
        me?.email ? tx("Chega em instantes em {{v0}}.", { v0: me.email }) : undefined,
      );
    } catch (e) {
      toast("error", tx("Não foi possível enviar o teste"), errorMessage(e));
    }
  };

  const doSend = async () => {
    const c = await ensureSaved();
    if (!c) {
      setConfirmSend(false);
      return;
    }
    try {
      const r = await send.mutateAsync(c.id);
      toast(
        "success",
        tx("Campanha enviada"),
        tx("{{v0}} e-mails na fila de envio.", { v0: r.queued.toLocaleString("pt-BR") }),
      );
    } catch (e) {
      toast("error", tx("Não foi possível enviar"), errorMessage(e));
    }
    setConfirmSend(false);
  };

  const doDelete = async () => {
    if (!campaign) return;
    try {
      await remove.mutateAsync(campaign.id);
      toast("success", tx("Rascunho apagado"));
      void navigate("/admin/campanhas", { replace: true });
    } catch (e) {
      toast("error", tx("Não foi possível apagar"), errorMessage(e));
    }
    setConfirmDelete(false);
  };

  const applyTemplate = (t: CampaignTemplate) => {
    setDraft((d) => ({ ...d, subject: t.subject, body: t.body(!!d.coupon_code), name: d.name || t.label }));
  };

  const busy = create.isPending || update.isPending;

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <BackLink />
      <AdminTitle
        title={campaign ? campaign.name : tx("Nova campanha")}
        subtitle={
          sent
            ? tx("Enviada {{v0}} para {{v1}} pessoas ({{v2}}). Campanhas enviadas não podem ser editadas.", {
                v0: fmtDate(campaign?.sent_at),
                v1: campaign?.recipients.toLocaleString("pt-BR"),
                v2: campaign?.segment_label,
              })
            : tx("Escreva, veja a prévia ao lado, envie um teste para você e só então envie para o segmento.")
        }
        actions={
          campaign ? (
            <CampaignStatusTag status={campaign.status} />
          ) : (
            <Tag variant="neutral">{tx("Rascunho")}</Tag>
          )
        }
      />

      <div className="grid grid-cols-1 gap-[14px] desktop:grid-cols-[minmax(0,1fr)_minmax(0,440px)] desktop:gap-6">
        <form
          className="flex flex-col gap-[14px] desktop:gap-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <AdminSection title={tx("Campanha")}>
            <fieldset disabled={sent} className="contents">
              <Field
                label={tx("Nome (só para o painel)")}
                htmlFor="camp-name"
                error={touched ? nameError : null}
              >
                <Input
                  id="camp-name"
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  invalid={touched && !!nameError}
                  maxLength={120}
                  placeholder={tx("Ex.: Reengajamento de setembro")}
                />
              </Field>
              <Field
                label={tx("Segmento")}
                htmlFor="camp-segment"
                error={touched ? segmentError : null}
                hint={
                  segments.isError
                    ? tx("Não foi possível carregar os segmentos: {{v0}}", {
                        v0: errorMessage(segments.error),
                      })
                    : tx("As contagens são de agora; o envio recalcula na hora.")
                }
              >
                <Select
                  id="camp-segment"
                  value={draft.segment}
                  onChange={(e) => set("segment", e.target.value)}
                  invalid={touched && !!segmentError}
                  disabled={segments.isLoading}
                >
                  <option value="">{segments.isLoading ? tx("Carregando…") : tx("Escolha…")}</option>
                  {(segments.data ?? []).map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label} ({s.count.toLocaleString("pt-BR")})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={tx("Cupom (opcional)")}
                htmlFor="camp-coupon"
                hint={
                  couponMissing
                    ? tx(
                        tx(
                          "O cupom {{v0}} não está ativo. O e-mail ainda mostra o código, mas ele não vai funcionar.",
                        ),
                        { v0: draft.coupon_code },
                      )
                    : selectedCoupon
                      ? tx("{{v0}}. Sem URL do botão, o link leva a Planos com o cupom preenchido.", {
                          v0: couponSummary(selectedCoupon),
                        })
                      : tx("Aparece onde você escrever {cupom}.")
                }
              >
                <Select
                  id="camp-coupon"
                  value={draft.coupon_code}
                  onChange={(e) => set("coupon_code", e.target.value)}
                  disabled={coupons.isLoading}
                >
                  <option value="">{coupons.isLoading ? tx("Carregando…") : tx("Sem cupom")}</option>
                  {couponMissing ? (
                    <option value={draft.coupon_code}>
                      {tx("{{v0}} (inativo)", { v0: draft.coupon_code })}
                    </option>
                  ) : null}
                  {couponList.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {couponSummary(c)}
                    </option>
                  ))}
                </Select>
              </Field>
            </fieldset>
          </AdminSection>

          <AdminSection
            title={tx("Conteúdo")}
            meta={
              !sent ? (
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label={tx("Modelos rápidos")}
                >
                  <span>{tx("Modelos:")}</span>
                  {TEMPLATES.map((t) => (
                    <Button
                      key={t.key}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => applyTemplate(t)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              ) : null
            }
          >
            <fieldset disabled={sent} className="contents">
              <Field label={tx("Assunto")} htmlFor="camp-subject" error={touched ? subjectError : null}>
                <Input
                  id="camp-subject"
                  value={draft.subject}
                  onChange={(e) => set("subject", e.target.value)}
                  invalid={touched && !!subjectError}
                  maxLength={160}
                />
              </Field>
              <Field
                label={tx("Corpo")}
                htmlFor="camp-body"
                error={touched ? bodyError : null}
                hint={
                  couponWarning ?? (
                    <>
                      {tx("Separe parágrafos com uma linha em branco. Use")} <code>{"{nome}"}</code>{" "}
                      {tx("para o primeiro nome da pessoa e")} <code>{"{cupom}"}</code>{" "}
                      {tx("para o código do cupom escolhido.")}
                    </>
                  )
                }
              >
                <Textarea
                  id="camp-body"
                  value={draft.body}
                  onChange={(e) => set("body", e.target.value)}
                  invalid={touched && !!bodyError}
                  maxLength={8000}
                  className="min-h-[260px]"
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 tablet:grid-cols-[200px_minmax(0,1fr)]">
                <Field
                  label={tx("Rótulo do botão")}
                  htmlFor="camp-cta-label"
                  error={touched ? ctaLabelError : null}
                  hint={tx('Vazio = "Abrir o Estudatta".')}
                >
                  <Input
                    id="camp-cta-label"
                    value={draft.cta_label}
                    onChange={(e) => set("cta_label", e.target.value)}
                    invalid={touched && !!ctaLabelError}
                    maxLength={60}
                    placeholder={tx("Abrir o Estudatta")}
                  />
                </Field>
                <Field
                  label={tx("URL do botão")}
                  htmlFor="camp-cta-url"
                  error={touched ? ctaUrlError : null}
                  hint={tx("Vazio = {{v0}}", { v0: defaultCtaUrl(APP_ORIGIN, draft.coupon_code) })}
                >
                  <Input
                    id="camp-cta-url"
                    type="url"
                    inputMode="url"
                    value={draft.cta_url}
                    onChange={(e) => set("cta_url", e.target.value)}
                    invalid={touched && !!ctaUrlError}
                    maxLength={400}
                    placeholder="https://"
                  />
                </Field>
              </div>
            </fieldset>
          </AdminSection>

          {!sent ? (
            <AdminSection title={tx("Ações")}>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="lg" loading={busy} disabled={campaign ? !dirty : false}>
                  {campaign ? tx("Salvar") : tx("Salvar rascunho")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  loading={test.isPending}
                  disabled={busy}
                  onClick={() => void doTest()}
                >
                  {tx("Enviar teste para mim")}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  disabled={busy || test.isPending}
                  onClick={() => setConfirmSend(true)}
                >
                  {tx("Enviar para o segmento")}
                </Button>
                {campaign ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="lg"
                    className="tablet:ml-auto"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    {tx("Apagar rascunho")}
                  </Button>
                ) : null}
              </div>
              <p className="text-[12px] text-neutral-400">
                {tx(
                  tx(
                    "Só recebe quem não desligou os e-mails de retorno em Preferências. {{v0}} Alterações não salvas são salvas antes de testar ou enviar.",
                  ),
                  { v0: me?.email ? " " + tx("O teste vai para {{v0}}.", { v0: me.email }) : "" },
                )}
              </p>
            </AdminSection>
          ) : null}
        </form>

        <Preview draft={draft} segmentLabel={segment?.label} />
      </div>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title={tx("Enviar para o segmento?")}
        description={
          segment
            ? tx(
                tx(
                  'Vai para até {{v0}} pessoas em "{{v1}}". Quem desligou os e-mails de retorno em Preferências fica de fora. Depois de enviada, a campanha não pode ser editada nem reenviada.',
                ),
                { v0: segment.count.toLocaleString("pt-BR"), v1: segment.label },
              )
            : tx("Escolha um segmento antes de enviar.")
        }
        confirmLabel={tx("Enviar agora")}
        cancelLabel={tx("Voltar")}
        danger
        loading={send.isPending || busy}
        onConfirm={doSend}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={tx("Apagar este rascunho?")}
        description={tx("O texto se perde. Campanhas já enviadas não podem ser apagadas.")}
        confirmLabel={tx("Apagar")}
        cancelLabel={tx("Voltar")}
        danger
        loading={remove.isPending}
        onConfirm={doDelete}
      />
    </div>
  );
}

function Preview({ draft, segmentLabel }: { draft: Draft; segmentLabel?: string }) {
  const coupon = draft.coupon_code;
  const subject = renderPreview(draft.subject, SAMPLE_NAME, coupon) || tx("(sem assunto)");
  const paragraphs = renderPreview(draft.body, SAMPLE_NAME, coupon)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ctaLabel = draft.cta_label.trim() || tx("Abrir o Estudatta");
  const ctaUrl = draft.cta_url.trim() || defaultCtaUrl(APP_ORIGIN, coupon);

  return (
    <aside
      aria-label={tx("Prévia do e-mail")}
      className="flex flex-col gap-3 desktop:sticky desktop:top-[85px] desktop:self-start"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="kicker">{tx("Prévia")}</span>
        <span className="text-[12px] text-neutral-400">
          {tx("como {{v0}} veria{{v1}}", {
            v0: SAMPLE_NAME,
            v1: segmentLabel ? ` · ${segmentLabel}` : "",
          })}
        </span>
      </div>
      <Card className="gap-3 p-4 desktop:p-5">
        <div className="flex flex-col gap-1 border-b border-divider pb-3 text-[13px]">
          <span className="text-neutral-400">{tx("Assunto")}</span>
          <span className="text-[15px] font-medium">{subject}</span>
        </div>
        <div className="flex flex-col gap-3 text-[14px] leading-[1.55]">
          {paragraphs.length === 0 ? (
            <span className="text-neutral-400">{tx("O corpo do e-mail aparece aqui.")}</span>
          ) : (
            paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line break-words">
                {p}
              </p>
            ))
          )}
        </div>
        <div className="flex flex-col gap-1 border-t border-divider pt-3">
          <span
            className="inline-flex min-h-[44px] w-fit items-center rounded-md border border-accent px-4 text-[15px] text-accent"
            aria-hidden
          >
            {ctaLabel}
          </span>
          <span className="tnum break-all text-[12px] text-neutral-400">{ctaUrl}</span>
        </div>
        <p className="text-[11px] text-neutral-400">
          {tx("Rodapé do servidor: link para desligar estes e-mails em Preferências.")}
        </p>
      </Card>
    </aside>
  );
}
