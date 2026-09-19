"""Idiomas que um objetivo da categoria "idioma" pode acompanhar.

Códigos ISO 639 (639-1 quando existe; 639-3 para línguas sem código de duas letras, como
cantonês, Libras e ASL). Os nomes estão em português. A ordem importa: os mais procurados
vêm primeiro e aparecem no topo da lista do app. `und` cobre qualquer outro idioma.
O app tem o mapa de nomes com o mesmo conjunto de códigos, conferido pelo TypeScript.
"""

from __future__ import annotations

DEFAULT_LANGUAGE = "en"

POPULAR: dict[str, str] = {
    "en": "Inglês",
    "es": "Espanhol",
    "fr": "Francês",
    "de": "Alemão",
    "it": "Italiano",
    "ja": "Japonês",
    "zh": "Chinês (mandarim)",
    "ko": "Coreano",
    "ru": "Russo",
    "ar": "Árabe",
    "bzs": "Libras (Língua Brasileira de Sinais)",
    "pt": "Português",
}

OTHERS: dict[str, str] = {
    "af": "Africâner",
    "sq": "Albanês",
    "am": "Amárico",
    "hy": "Armênio",
    "az": "Azerbaijano",
    "eu": "Basco",
    "bn": "Bengali",
    "be": "Bielorrusso",
    "my": "Birmanês",
    "bs": "Bósnio",
    "bg": "Búlgaro",
    "yue": "Cantonês",
    "ca": "Catalão",
    "kk": "Cazaque",
    "si": "Cingalês",
    "hr": "Croata",
    "ht": "Crioulo haitiano",
    "ku": "Curdo",
    "da": "Dinamarquês",
    "sk": "Eslovaco",
    "sl": "Esloveno",
    "eo": "Esperanto",
    "et": "Estoniano",
    "fi": "Finlandês",
    "gd": "Gaélico escocês",
    "gl": "Galego",
    "cy": "Galês",
    "ka": "Georgiano",
    "el": "Grego",
    "gn": "Guarani",
    "gu": "Guzerate",
    "ha": "Hauçá",
    "haw": "Havaiano",
    "he": "Hebraico",
    "hi": "Hindi",
    "nl": "Holandês",
    "hu": "Húngaro",
    "ig": "Igbo",
    "yi": "Iídiche",
    "id": "Indonésio",
    "yo": "Iorubá",
    "ga": "Irlandês",
    "is": "Islandês",
    "km": "Khmer",
    "lo": "Laosiano",
    "la": "Latim",
    "lv": "Letão",
    "ase": "Língua de sinais americana (ASL)",
    "lt": "Lituano",
    "lb": "Luxemburguês",
    "mk": "Macedônio",
    "ms": "Malaio",
    "mt": "Maltês",
    "mi": "Maori",
    "mr": "Marati",
    "mn": "Mongol",
    "nah": "Náuatle",
    "ne": "Nepali",
    "no": "Norueguês",
    "ps": "Pachto",
    "pa": "Panjabi",
    "fa": "Persa",
    "pl": "Polonês",
    "qu": "Quíchua",
    "ro": "Romeno",
    "sr": "Sérvio",
    "so": "Somali",
    "sw": "Suaíli",
    "sv": "Sueco",
    "tl": "Tagalo (filipino)",
    "th": "Tailandês",
    "ta": "Tâmil",
    "cs": "Tcheco",
    "te": "Telugu",
    "tr": "Turco",
    "uk": "Ucraniano",
    "ur": "Urdu",
    "uz": "Uzbeque",
    "vi": "Vietnamita",
    "xh": "Xhosa",
    "zu": "Zulu",
    "und": "Outro idioma",
}

LANGUAGES: dict[str, str] = {**POPULAR, **OTHERS}
LANGUAGE_CODES: tuple[str, ...] = tuple(LANGUAGES)


def language_name(code: str | None) -> str | None:
    return LANGUAGES.get(code) if code else None
