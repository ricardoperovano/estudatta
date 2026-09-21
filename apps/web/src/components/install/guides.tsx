/**
 * Passo a passo de instalação por plataforma/navegador. Os textos seguem os nomes que aparecem
 * nos menus em português (iOS, Chrome, Samsung Internet, Firefox, Safari no Mac).
 */
import { t } from "@/i18n";
import * as React from "react";
import type { InstallEnv, InstallPlatform, PlatformGroup } from "@/lib/device";
import {
  AppWindow,
  Copy,
  DotsThree,
  DotsThreeVertical,
  DownloadSimple,
  Export,
  House,
  List,
  MonitorArrowUp,
  PlusSquare,
  Star,
} from "@phosphor-icons/react";
import {
  AddressBar,
  ConfirmDialog,
  Dock,
  HomeScreen,
  IosAddSheet,
  MacFileMenu,
  MenuRows,
  SafariToolbar,
  SamsungToolbar,
} from "./illustrations";
import { CopyLinkButton } from "./copy-link";

export interface GuideStep {
  title: React.ReactNode;
  text?: React.ReactNode;
  art?: React.ReactNode;
  action?: React.ReactNode;
}

export interface Guide {
  platform: InstallPlatform;
  /** Nome curto do navegador, para o seletor. */
  label: string;
  /** Aviso acima dos passos (ex.: "só o Safari consegue neste iOS"). */
  note?: React.ReactNode;
  steps: GuideStep[];
}

export const GROUP_LABEL: Record<PlatformGroup, string> = {
  ios: "iPhone/iPad",
  android: "Android",
  desktop: "Computador",
};

/** Navegadores com passo a passo próprio em cada grupo (o primeiro é o padrão). */
const VARIANTS: Record<PlatformGroup, InstallPlatform[]> = {
  ios: ["ios-safari", "ios-other"],
  android: ["android-chrome", "android-samsung", "android-firefox"],
  desktop: ["desktop-chromium", "desktop-safari"],
};

/** Variantes do grupo; a do navegador detectado vem primeiro (mesmo quando não está na lista padrão). */
export function variantsFor(group: PlatformGroup, env: InstallEnv): InstallPlatform[] {
  const base = VARIANTS[group];
  if (env.group !== group) return base;
  const rest = base.filter(
    (p) => p !== env.platform && !(env.platform === "ios-other-legacy" && p === "ios-other"),
  );
  return [env.platform, ...rest];
}

const icons = {
  share: <Export size={18} weight="bold" />,
  kebab: <DotsThreeVertical size={18} weight="bold" />,
  dots: <DotsThree size={18} weight="bold" />,
  burger: <List size={18} weight="bold" />,
  install: <MonitorArrowUp size={18} weight="bold" />,
};

const rowIcons = {
  copy: <Copy size={14} />,
  star: <Star size={14} />,
  plusSquare: <PlusSquare size={16} weight="bold" />,
  download: <DownloadSimple size={16} weight="bold" />,
  app: <AppWindow size={16} weight="bold" />,
  home: <House size={16} weight="bold" />,
  browser: <Export size={14} />,
};

const q = (s: string) => <strong className="font-medium text-primary">“{s}”</strong>;

const openFromIcon: GuideStep = {
  title: t("Abra pelo ícone na tela de início"),
  text: t("É por ali que o app abre em tela cheia e pode te mandar lembretes."),
  art: <HomeScreen />,
};

const shareSheet = (extra: React.ReactNode): GuideStep => ({
  title: <>{t("Escolha {{v0}}", { v0: q(t("Adicionar à Tela de Início")) })}</>,
  text: extra,
  art: (
    <MenuRows
      rows={[
        ["Copiar", rowIcons.copy],
        ["Adicionar aos Favoritos", rowIcons.star],
      ]}
      highlight={t("Adicionar à Tela de Início")}
      highlightIcon={rowIcons.plusSquare}
    />
  ),
});

const iosAdd: GuideStep = {
  title: <>{t("Toque em {{v0}}", { v0: q(t("Adicionar")) })}</>,
  text: (
    <>
      {t("Pode manter o nome Estudatta. Se aparecer {{v0}}, deixe ligado.", {
        v0: q(t("Abrir como App Web")),
      })}
    </>
  ),
  art: <IosAddSheet />,
};

export function getGuide(platform: InstallPlatform, env: InstallEnv): Guide {
  switch (platform) {
    case "ios-safari":
      return {
        platform,
        label: t("Safari"),
        steps: [
          {
            title: <>{t("Toque em {{v0}}", { v0: q(t("Compartilhar")) })}</>,
            text: (
              <>
                {t(
                  "É o quadrado com uma seta para cima, na barra do Safari (embaixo no iPhone, em cima no iPad). Se só aparecer •••, toque nele primeiro.",
                )}
              </>
            ),
            art: <SafariToolbar />,
          },
          shareSheet(
            <>
              {t(
                "Role a lista para baixo. Se não estiver lá, toque em {{v0}} no fim da lista e ative a opção.",
                { v0: q(t("Editar Ações…")) },
              )}
            </>,
          ),
          iosAdd,
          openFromIcon,
        ],
      };
    case "ios-other": {
      const b = env.platform === "ios-other" ? env.browser : t("Chrome");
      return {
        platform,
        label: env.platform === "ios-other" ? env.browser : t("Chrome e outros"),
        steps: [
          {
            title: <>{t("Toque em {{v0}}", { v0: q(t("Compartilhar")) })}</>,
            text:
              b === "Chrome" ? (
                <>
                  {t(
                    "No Chrome, fica na barra de endereço, à direita. No Firefox e no Edge, abra o menu (☰ ou •••) e toque em Compartilhar.",
                  )}
                </>
              ) : (
                <>
                  {t(
                    "No {{v0}}, abra o menu (☰ ou •••) e toque em Compartilhar. No Chrome, o botão fica na barra de endereço.",
                    { v0: b },
                  )}
                </>
              ),
            art: <AddressBar icon={icons.share} />,
          },
          shareSheet(
            <>
              {t("Se não aparecer de cara, toque em {{v0}} ou role a lista para baixo.", {
                v0: q(t("Mais")),
              })}
            </>,
          ),
          iosAdd,
          openFromIcon,
        ],
      };
    }
    case "ios-other-legacy":
      return {
        platform,
        label: env.browser,
        note: (
          <>
            {t(
              "Nesta versão do iOS, só o Safari consegue colocar o app na tela de início. Leva um minutinho:",
            )}
          </>
        ),
        steps: [
          { title: t("Copie o link desta página"), action: <CopyLinkButton /> },
          {
            title: t("Abra o Safari e cole o link"),
            text: t("Toque na barra de endereço do Safari, cole e abra."),
          },
          {
            title: (
              <>
                {t("Lá, toque em {{v0}} e depois em {{v1}}", {
                  v0: q(t("Compartilhar")),
                  v1: q(t("Adicionar à Tela de Início")),
                })}
              </>
            ),
            art: <SafariToolbar />,
          },
        ],
      };
    case "in-app":
      return {
        platform,
        label: t("Este app"),
        note: (
          <>
            {t(
              "Você abriu o Estudatta dentro de outro app (Instagram, Facebook, WhatsApp…). Por aqui não dá para instalar.",
            )}
          </>
        ),
        steps: [
          {
            title: <>{t("Abra no navegador")}</>,
            text: (
              <>
                {t("Toque no menu (••• ou ⋮), geralmente num canto da tela, e escolha {{v0}}", {
                  v0: q(t("Abrir no navegador")),
                })}
                {env.group === "ios" ? (
                  <> {t("ou {{v0}}", { v0: q(t("Abrir no Safari")) })}</>
                ) : (
                  <> {t("ou {{v0}}", { v0: q(t("Abrir no Chrome")) })}</>
                )}
                .
              </>
            ),
            art: <AddressBar icon={icons.dots} />,
          },
          { title: t("Não achou? Copie o link e cole no navegador"), action: <CopyLinkButton /> },
          {
            title: t("Depois, siga o passo a passo do navegador"),
            text: t("Esta página mostra os passos certinhos assim que você abrir por lá."),
          },
        ],
      };
    case "android-chrome":
      return {
        platform,
        label: t("Chrome"),
        steps: [
          {
            title: <>{t("Toque no menu ⋮")}</>,
            text: t("São os três pontinhos no canto superior direito do Chrome."),
            art: <AddressBar icon={icons.kebab} />,
          },
          {
            title: <>{t("Toque em {{v0}}", { v0: q(t("Instalar app")) })}</>,
            text: (
              <>{t("Em algumas versões aparece como {{v0}}.", { v0: q(t("Adicionar à tela inicial")) })}</>
            ),
            art: (
              <MenuRows
                rows={[
                  [t("Nova guia"), null],
                  [t("Histórico"), null],
                ]}
                highlight={t("Instalar app")}
                highlightIcon={rowIcons.download}
              />
            ),
          },
          {
            title: <>{t("Confirme em {{v0}}", { v0: q(t("Instalar")) })}</>,
            art: <ConfirmDialog title={t("Instalar app?")} action="Instalar" />,
          },
          {
            title: t("Pronto: o ícone aparece na tela inicial"),
            text: t("Se não aparecer, procure o Estudatta na lista de apps."),
            art: <HomeScreen />,
          },
        ],
      };
    case "android-samsung":
      return {
        platform,
        label: t("Samsung Internet"),
        steps: [
          {
            title: <>{t("Toque no menu ≡")}</>,
            text: t(
              "Fica na barra de baixo, à direita. Se aparecer um ícone de download na barra de endereço, pode tocar direto nele.",
            ),
            art: <SamsungToolbar />,
          },
          {
            title: <>{t("Toque em {{v0}}", { v0: q(t("Adicionar página a")) })}</>,
            text: <>{t("E escolha {{v0}}.", { v0: q(t("Tela inicial")) })}</>,
            art: (
              <MenuRows
                rows={[
                  ["Favoritos", rowIcons.star],
                  ["Compartilhar", rowIcons.browser],
                ]}
                highlight={t("Adicionar página a")}
                highlightIcon={rowIcons.plusSquare}
              />
            ),
          },
          {
            title: <>{t("Confirme em {{v0}}", { v0: q(t("Adicionar")) })}</>,
            art: <ConfirmDialog title={t("Adicionar à tela inicial")} action="Adicionar" />,
          },
          { title: t("Pronto: abra pelo ícone"), art: <HomeScreen /> },
        ],
      };
    case "android-firefox":
      return {
        platform,
        label: t("Firefox"),
        steps: [
          {
            title: <>{t("Toque no menu ⋮")}</>,
            text: t(
              "Os três pontinhos ficam na barra do Firefox (em cima ou embaixo, conforme a sua configuração).",
            ),
            art: <AddressBar icon={icons.kebab} />,
          },
          {
            title: <>{t("Toque em {{v0}}", { v0: q(t("Adicionar à tela inicial")) })}</>,
            text: (
              <>
                {t("Em versões novas pode aparecer como {{v0}} ou {{v1}}.", {
                  v0: q(t("Adicionar app à tela inicial")),
                  v1: q(t("Instalar")),
                })}
              </>
            ),
            art: (
              <MenuRows
                rows={[
                  ["Nova aba", null],
                  ["Favoritos", rowIcons.star],
                ]}
                highlight={t("Adicionar à tela inicial")}
                highlightIcon={rowIcons.home}
              />
            ),
          },
          {
            title: <>{t("Confirme em {{v0}}", { v0: q(t("Adicionar")) })}</>,
            art: <ConfirmDialog title={t("Adicionar à tela inicial")} action="Adicionar" />,
          },
          { title: t("Pronto: abra pelo ícone"), art: <HomeScreen /> },
        ],
      };
    case "android-other":
      return {
        platform,
        label: env.platform === "android-other" ? env.browser : t("Outros"),
        steps: [
          {
            title: t("Abra o menu do navegador"),
            text: t("Normalmente são três pontinhos (⋮) ou três tracinhos (≡)."),
            art: <AddressBar icon={icons.kebab} />,
          },
          {
            title: (
              <>
                {t("Procure {{v0}} ou {{v1}}", {
                  v0: q(t("Instalar app")),
                  v1: q(t("Adicionar à tela inicial")),
                })}
              </>
            ),
            text: (
              <>
                {t("No Edge, a opção se chama {{v0}}. Se não encontrar, abra esta página no Chrome.", {
                  v0: q(t("Adicionar ao telefone")),
                })}
              </>
            ),
            art: (
              <MenuRows
                rows={[["Favoritos", rowIcons.star]]}
                highlight={t("Adicionar à tela inicial")}
                highlightIcon={rowIcons.home}
              />
            ),
          },
          { title: t("Pronto: abra pelo ícone"), art: <HomeScreen /> },
        ],
      };
    case "desktop-chromium":
      return {
        platform,
        label: t("Chrome e Edge"),
        steps: [
          {
            title: t("Clique no ícone de instalar"),
            text: (
              <>
                {t(
                  "Fica no fim da barra de endereço. Não apareceu? No Chrome, abra o menu ⋮ → {{v0}} → {{v1}}. No Edge, menu ••• →",
                  { v0: q(t("Transmitir, salvar e compartilhar")), v1: q(t("Instalar Estudatta")) },
                )}{" "}
                {q("Apps")} → {q(t("Instalar este site como um app"))}.
              </>
            ),
            art: <AddressBar icon={icons.install} />,
          },
          {
            title: <>{t("Confirme em {{v0}}", { v0: q(t("Instalar")) })}</>,
            art: <ConfirmDialog title={t("Instalar app?")} action="Instalar" />,
          },
          {
            title: t("O app abre numa janela própria"),
            text: t("Fixe na barra de tarefas (ou no Dock, no Mac) para abrir com um clique."),
            art: <Dock />,
          },
        ],
      };
    case "desktop-safari":
      return {
        platform,
        label: t("Safari (Mac)"),
        steps: [
          {
            title: <>{t("No menu Arquivo, clique em {{v0}}", { v0: q(t("Adicionar ao Dock…")) })}</>,
            text: t(
              "Também dá pelo botão Compartilhar da barra do Safari. Precisa do macOS Sonoma (14) ou mais novo.",
            ),
            art: <MacFileMenu />,
          },
          {
            title: <>{t("Confirme em {{v0}}", { v0: q(t("Adicionar")) })}</>,
            art: <ConfirmDialog title={t("Adicionar ao Dock")} action="Adicionar" />,
          },
          {
            title: t("Abra pelo Dock"),
            text: t("O Estudatta abre numa janela própria, sem as barras do navegador."),
            art: <Dock />,
          },
        ],
      };
    case "desktop-other":
      return {
        platform,
        label: env.platform === "desktop-other" ? env.browser : t("Outros"),
        note: <>{t("Este navegador não instala apps no computador.")}</>,
        steps: [
          {
            title: t("Abra o Estudatta no Chrome ou no Edge"),
            text: t(
              "No Mac, o Safari do macOS Sonoma (14) ou mais novo também instala. Depois é só seguir os passos de lá.",
            ),
            action: <CopyLinkButton />,
          },
          {
            title: t("Ou deixe nos favoritos"),
            text: t("Ctrl+D (⌘+D no Mac) salva a página para abrir rapidinho."),
          },
        ],
      };
  }
}

/** Instrução de uma linha para o navegador detectado (ex.: cartão em Preferências). */
export function shortHint(env: InstallEnv): React.ReactNode {
  switch (env.platform) {
    case "ios-safari":
      return (
        <>
          {t("No Safari, toque em Compartilhar e depois em {{v0}}.", {
            v0: q(t("Adicionar à Tela de Início")),
          })}
        </>
      );
    case "ios-other":
      return (
        <>
          {t("No {{v0}}, toque em Compartilhar e depois em {{v1}}.", {
            v0: env.browser,
            v1: q(t("Adicionar à Tela de Início")),
          })}
        </>
      );
    case "ios-other-legacy":
      return (
        <>
          {t("Nesta versão do iOS, abra no Safari e toque em Compartilhar → {{v0}}.", {
            v0: q(t("Adicionar à Tela de Início")),
          })}
        </>
      );
    case "android-chrome":
      return <>{t("No Chrome, toque no menu ⋮ e depois em {{v0}}.", { v0: q(t("Instalar app")) })}</>;
    case "android-samsung":
      return (
        <>
          {t("No Samsung Internet, toque no menu ≡ → {{v0}} → {{v1}}.", {
            v0: q(t("Adicionar página a")),
            v1: q(t("Tela inicial")),
          })}
        </>
      );
    case "android-firefox":
      return (
        <>{t("No Firefox, toque no menu ⋮ e depois em {{v0}}.", { v0: q(t("Adicionar à tela inicial")) })}</>
      );
    case "android-other":
      return (
        <>
          {t("No menu do navegador, procure {{v0}} ou {{v1}}.", {
            v0: q(t("Instalar app")),
            v1: q(t("Adicionar à tela inicial")),
          })}
        </>
      );
    case "desktop-chromium":
      return (
        <>{t("No {{v0}}, clique no ícone de instalar no fim da barra de endereço.", { v0: env.browser })}</>
      );
    case "desktop-safari":
      return <>{t("No Safari, vá em Arquivo → {{v0}}.", { v0: q(t("Adicionar ao Dock…")) })}</>;
    case "desktop-other":
      return <>{t("Este navegador não instala apps. Use Chrome, Edge ou o Safari do Mac.")}</>;
    case "in-app":
      return (
        <>
          {t("Abra esta página no navegador (menu ••• → {{v0}}) para instalar.", {
            v0: q(t("Abrir no navegador")),
          })}
        </>
      );
  }
}
