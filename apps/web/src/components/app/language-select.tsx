import { t } from "@/i18n";
import { Select } from "@/components/ui";
import { languageName, OTHER_LANGUAGES, POPULAR_LANGUAGES, type LanguageCode } from "@/lib/languages";

/** Lista de idiomas: os mais procurados no topo, depois todos em ordem alfabética. */
export function LanguageSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: LanguageCode;
  onChange: (v: LanguageCode) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as LanguageCode)}
    >
      <optgroup label={t("Mais procurados")}>
        {POPULAR_LANGUAGES.map((c) => (
          <option key={c} value={c}>
            {languageName(c)}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("Todos os idiomas")}>
        {OTHER_LANGUAGES.map((c) => (
          <option key={c} value={c}>
            {languageName(c)}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
