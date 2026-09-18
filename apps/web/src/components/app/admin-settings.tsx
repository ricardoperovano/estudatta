/** Painel administrativo — configurações em tempo de execução (marca, recursos, limites). */
import * as React from "react";
import { errorMessage } from "@/api/client";
import { SETTING_KEYS, useAdminSetting, useSaveSetting, type SettingKey, type SettingOut } from "@/api/admin";
import { fmtDate, humanize, isPlainObject, shortId, stableJson } from "@/components/app/admin-format";
import { LimitsEditor } from "@/components/app/admin-limits";
import { AdminSection, AdminTitle, QueryGate } from "@/components/app/admin-shared";
import { Banner, Button, Field, Input, Seg, Switch, Tag, Textarea, toast } from "@/components/ui";

type Value = Record<string, unknown>;

const TITLE: Record<SettingKey, string> = { brand: "Marca e contato", feature_flags: "Recursos ligados", limits: "Limites gerais" };
const HELP: Record<SettingKey, string> = {
  brand: "Dados públicos da marca. Campos vazios ficam como pendentes.",
  feature_flags: "Liga ou desliga recursos. O padrão vem das credenciais configuradas no servidor.",
  limits: "Limites aplicados de forma geral, no mesmo formato dos limites de plano.",
};

const BRAND_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "name", label: "Nome da marca" },
  { key: "support_email", label: "E-mail de suporte", type: "email" },
  { key: "company_name", label: "Nome fantasia da empresa" },
  { key: "legal_name", label: "Razão social" },
  { key: "cnpj", label: "CNPJ" },
  { key: "phone", label: "Telefone", type: "tel" },
  { key: "address", label: "Endereço" },
];
const SOCIAL_KEYS = ["facebook", "instagram", "linkedin", "tiktok", "whatsapp", "x", "youtube"];
const FLAG_RE = /^[a-z][a-z0-9_]{0,31}$/;

export function AdminSettingsPage() {
  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle title="Configurações" subtitle="Cada bloco é salvo separadamente e fica registrado na auditoria." />
      {SETTING_KEYS.map((k) => (
        <SettingBlock key={k} settingKey={k} />
      ))}
    </div>
  );
}

function SettingBlock({ settingKey }: { settingKey: SettingKey }) {
  const setting = useAdminSetting(settingKey);
  const s = setting.data;
  return (
    <AdminSection
      title={TITLE[settingKey]}
      meta={
        s ? (
          s.is_default ? (
            <Tag variant="neutral">padrão</Tag>
          ) : (
            <span className="tnum">
              salvo {fmtDate(s.updated_at)} por {shortId(s.updated_by)}
            </span>
          )
        ) : null
      }
    >
      <p className="m-0 text-[13px] text-neutral-400">{HELP[settingKey]}</p>
      <QueryGate query={setting}>{(data) => <SettingEditor key={`${data.updated_at ?? "default"}:${stableJson(data.value)}`} setting={data} settingKey={settingKey} />}</QueryGate>
    </AdminSection>
  );
}

/** `pending` em brand é calculado pelo servidor: não é editável nem enviado. */
function editable(key: SettingKey, value: Value): Value {
  if (key !== "brand") return value;
  const rest = { ...value };
  delete rest.pending;
  return rest;
}

function SettingEditor({ setting, settingKey }: { setting: SettingOut; settingKey: SettingKey }) {
  const save = useSaveSetting();
  const initial = React.useMemo(() => editable(settingKey, setting.value), [settingKey, setting.value]);
  const [value, setValue] = React.useState<Value>(initial);
  const [mode, setMode] = React.useState<"form" | "json">("form");
  const [json, setJson] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  let jsonError: string | null = null;
  let jsonValue: Value | null = null;
  if (mode === "json") {
    try {
      const parsed: unknown = JSON.parse(json);
      if (isPlainObject(parsed)) jsonValue = parsed;
      else jsonError = "O valor precisa ser um objeto JSON ({ … }).";
    } catch (e) {
      jsonError = `JSON inválido: ${e instanceof Error ? e.message : "erro de sintaxe"}`;
    }
  }
  const current = mode === "json" ? jsonValue : value;
  const dirty = current !== null && stableJson(current) !== stableJson(initial);

  const switchMode = (m: "form" | "json") => {
    if (m === mode) return;
    if (m === "json") {
      setJson(JSON.stringify(value, null, 2));
      setMode("json");
    } else if (jsonValue) {
      setValue(jsonValue);
      setMode("form");
    } else {
      toast("error", "Corrija o JSON antes de voltar ao formulário");
    }
  };

  const submit = async () => {
    if (!current) return;
    setError(null);
    try {
      await save.mutateAsync({ key: settingKey, value: current });
      toast("success", "Configuração salva", TITLE[settingKey]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const pending = Array.isArray(setting.value.pending) ? setting.value.pending.map(String) : [];

  return (
    <div className="flex flex-col gap-3">
      <Seg
        label="Modo de edição"
        value={mode}
        onChange={switchMode}
        options={[
          { value: "form", label: "Formulário" },
          { value: "json", label: "JSON" },
        ]}
        className="self-start"
      />
      {pending.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-400">
          Pendentes:
          {pending.map((p) => (
            <Tag key={p} variant="pending">
              {humanize(p)}
            </Tag>
          ))}
        </div>
      ) : null}

      {mode === "json" ? (
        <Field label="Valor (JSON)" htmlFor={`setting-json-${settingKey}`} error={jsonError}>
          <Textarea id={`setting-json-${settingKey}`} value={json} onChange={(e) => setJson(e.target.value)} invalid={!!jsonError} spellCheck={false} className="min-h-[220px] font-mono text-[12px]" />
        </Field>
      ) : settingKey === "feature_flags" ? (
        <FlagsForm value={value} onChange={setValue} />
      ) : settingKey === "limits" ? (
        <LimitsEditor idPrefix="setting-limits" value={value} onChange={setValue} />
      ) : (
        <BrandForm value={value} onChange={setValue} />
      )}

      {error ? <Banner kind="error">{error}</Banner> : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty ? (
          <Button
            variant="ghost-muted"
            size="lg"
            onClick={() => {
              setValue(initial);
              setJson(JSON.stringify(initial, null, 2));
            }}
          >
            Desfazer
          </Button>
        ) : (
          <span className="text-[12px] text-neutral-400">Sem alterações.</span>
        )}
        <Button size="lg" loading={save.isPending} disabled={!dirty} onClick={() => void submit()}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

function FlagsForm({ value, onChange }: { value: Value; onChange: (v: Value) => void }) {
  const [name, setName] = React.useState("");
  const nameError = !name ? null : !FLAG_RE.test(name) ? "Minúsculas, números e _, começando por letra (até 32)." : name in value ? "Já existe." : null;
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || nameError) return;
    onChange({ ...value, [name]: false });
    setName("");
  };
  return (
    <div className="flex flex-col gap-1">
      {Object.entries(value).map(([k, v]) =>
        typeof v === "boolean" ? (
          <label key={k} className="flex min-h-[44px] items-center justify-between gap-3 border-b border-divider text-[14px]">
            <span>
              {humanize(k)} <code className="text-[11px] text-neutral-400">{k}</code>
            </span>
            <Switch checked={v} onCheckedChange={(c) => onChange({ ...value, [k]: c })} label={humanize(k)} />
          </label>
        ) : (
          <div key={k} className="rounded-md bg-error-tint p-2 text-[13px]">
            <code>{k}</code> não é verdadeiro/falso; corrija pelo modo JSON.
          </div>
        ),
      )}
      <form onSubmit={add} className="mt-2 flex flex-wrap items-start gap-2" noValidate>
        <Field error={nameError} className="min-w-0 flex-1 tablet:max-w-[280px]">
          <Input aria-label="Nome do novo recurso" placeholder="novo_recurso" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} invalid={!!nameError} spellCheck={false} autoCapitalize="none" />
        </Field>
        <Button type="submit" variant="secondary" size="lg" disabled={!name || !!nameError}>
          Adicionar
        </Button>
      </form>
    </div>
  );
}

function BrandForm({ value, onChange }: { value: Value; onChange: (v: Value) => void }) {
  const social = isPlainObject(value.social) ? value.social : {};
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const known = new Set([...BRAND_FIELDS.map((f) => f.key), "social"]);
  const extra = Object.keys(value).filter((k) => !known.has(k));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
        {BRAND_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`brand-${f.key}`}>
            <Input id={`brand-${f.key}`} type={f.type ?? "text"} maxLength={300} value={text(value[f.key])} onChange={(e) => onChange({ ...value, [f.key]: e.target.value || null })} />
          </Field>
        ))}
      </div>
      <span className="kicker">Redes sociais</span>
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
        {SOCIAL_KEYS.map((k) => (
          <Field key={k} label={k} htmlFor={`brand-social-${k}`}>
            <Input
              id={`brand-social-${k}`}
              maxLength={300}
              placeholder="Endereço ou usuário"
              value={text(social[k])}
              onChange={(e) => onChange({ ...value, social: { ...social, [k]: e.target.value || null } })}
            />
          </Field>
        ))}
      </div>
      {extra.length ? <Banner kind="info">Campos fora do formulário ({extra.join(", ")}): edite pelo modo JSON.</Banner> : null}
    </div>
  );
}
