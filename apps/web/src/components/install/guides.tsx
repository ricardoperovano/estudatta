/**
 * Passo a passo de instalação por plataforma/navegador. Os textos seguem os nomes que aparecem
 * nos menus em português (iOS, Chrome, Samsung Internet, Firefox, Safari no Mac).
 */
import * as React from "react";
import type { InstallEnv, InstallPlatform, PlatformGroup } from "@/lib/device";
import { AppWindow, Copy, DotsThree, DotsThreeVertical, DownloadSimple, Export, House, List, MonitorArrowUp, PlusSquare, Star } from "@phosphor-icons/react";
import { AddressBar, ConfirmDialog, Dock, HomeScreen, IosAddSheet, MacFileMenu, MenuRows, SafariToolbar, SamsungToolbar } from "./illustrations";
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
  const rest = base.filter((p) => p !== env.platform && !(env.platform === "ios-other-legacy" && p === "ios-other"));
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
  title: "Abra pelo ícone na tela de início",
  text: "É por ali que o app abre em tela cheia e pode te mandar lembretes.",
  art: <HomeScreen />,
};

const shareSheet = (extra: React.ReactNode): GuideStep => ({
  title: <>Escolha {q("Adicionar à Tela de Início")}</>,
  text: extra,
  art: <MenuRows rows={[["Copiar", rowIcons.copy], ["Adicionar aos Favoritos", rowIcons.star]]} highlight="Adicionar à Tela de Início" highlightIcon={rowIcons.plusSquare} />,
});

const iosAdd: GuideStep = {
  title: <>Toque em {q("Adicionar")}</>,
  text: <>Pode manter o nome Estudatta. Se aparecer {q("Abrir como App Web")}, deixe ligado.</>,
  art: <IosAddSheet />,
};

export function getGuide(platform: InstallPlatform, env: InstallEnv): Guide {
  switch (platform) {
    case "ios-safari":
      return {
        platform,
        label: "Safari",
        steps: [
          {
            title: <>Toque em {q("Compartilhar")}</>,
            text: <>É o quadrado com uma seta para cima, na barra do Safari (embaixo no iPhone, em cima no iPad). Se só aparecer •••, toque nele primeiro.</>,
            art: <SafariToolbar />,
          },
          shareSheet(<>Role a lista para baixo. Se não estiver lá, toque em {q("Editar Ações…")} no fim da lista e ative a opção.</>),
          iosAdd,
          openFromIcon,
        ],
      };
    case "ios-other": {
      const b = env.platform === "ios-other" ? env.browser : "Chrome";
      return {
        platform,
        label: env.platform === "ios-other" ? env.browser : "Chrome e outros",
        steps: [
          {
            title: <>Toque em {q("Compartilhar")}</>,
            text:
              b === "Chrome" ? (
                <>No Chrome, fica na barra de endereço, à direita. No Firefox e no Edge, abra o menu (☰ ou •••) e toque em Compartilhar.</>
              ) : (
                <>No {b}, abra o menu (☰ ou •••) e toque em Compartilhar. No Chrome, o botão fica na barra de endereço.</>
              ),
            art: <AddressBar icon={icons.share} />,
          },
          shareSheet(<>Se não aparecer de cara, toque em {q("Mais")} ou role a lista para baixo.</>),
          iosAdd,
          openFromIcon,
        ],
      };
    }
    case "ios-other-legacy":
      return {
        platform,
        label: env.browser,
        note: <>Nesta versão do iOS, só o Safari consegue colocar o app na tela de início. Leva um minutinho:</>,
        steps: [
          { title: "Copie o link desta página", action: <CopyLinkButton /> },
          { title: "Abra o Safari e cole o link", text: "Toque na barra de endereço do Safari, cole e abra." },
          { title: <>Lá, toque em {q("Compartilhar")} e depois em {q("Adicionar à Tela de Início")}</>, art: <SafariToolbar /> },
        ],
      };
    case "in-app":
      return {
        platform,
        label: "Este app",
        note: <>Você abriu o Estudatta dentro de outro app (Instagram, Facebook, WhatsApp…). Por aqui não dá para instalar.</>,
        steps: [
          {
            title: <>Abra no navegador</>,
            text: (
              <>
                Toque no menu (••• ou ⋮), geralmente num canto da tela, e escolha {q("Abrir no navegador")}
                {env.group === "ios" ? <> ou {q("Abrir no Safari")}</> : <> ou {q("Abrir no Chrome")}</>}.
              </>
            ),
            art: <AddressBar icon={icons.dots} />,
          },
          { title: "Não achou? Copie o link e cole no navegador", action: <CopyLinkButton /> },
          { title: "Depois, siga o passo a passo do navegador", text: "Esta página mostra os passos certinhos assim que você abrir por lá." },
        ],
      };
    case "android-chrome":
      return {
        platform,
        label: "Chrome",
        steps: [
          { title: <>Toque no menu ⋮</>, text: "São os três pontinhos no canto superior direito do Chrome.", art: <AddressBar icon={icons.kebab} /> },
          {
            title: <>Toque em {q("Instalar app")}</>,
            text: <>Em algumas versões aparece como {q("Adicionar à tela inicial")}.</>,
            art: <MenuRows rows={[["Nova guia", null], ["Histórico", null]]} highlight="Instalar app" highlightIcon={rowIcons.download} />,
          },
          { title: <>Confirme em {q("Instalar")}</>, art: <ConfirmDialog title="Instalar app?" action="Instalar" /> },
          { title: "Pronto: o ícone aparece na tela inicial", text: "Se não aparecer, procure o Estudatta na lista de apps.", art: <HomeScreen /> },
        ],
      };
    case "android-samsung":
      return {
        platform,
        label: "Samsung Internet",
        steps: [
          {
            title: <>Toque no menu ≡</>,
            text: "Fica na barra de baixo, à direita. Se aparecer um ícone de download na barra de endereço, pode tocar direto nele.",
            art: <SamsungToolbar />,
          },
          {
            title: <>Toque em {q("Adicionar página a")}</>,
            text: <>E escolha {q("Tela inicial")}.</>,
            art: <MenuRows rows={[["Favoritos", rowIcons.star], ["Compartilhar", rowIcons.browser]]} highlight="Adicionar página a" highlightIcon={rowIcons.plusSquare} />,
          },
          { title: <>Confirme em {q("Adicionar")}</>, art: <ConfirmDialog title="Adicionar à tela inicial" action="Adicionar" /> },
          { title: "Pronto: abra pelo ícone", art: <HomeScreen /> },
        ],
      };
    case "android-firefox":
      return {
        platform,
        label: "Firefox",
        steps: [
          { title: <>Toque no menu ⋮</>, text: "Os três pontinhos ficam na barra do Firefox (em cima ou embaixo, conforme a sua configuração).", art: <AddressBar icon={icons.kebab} /> },
          {
            title: <>Toque em {q("Adicionar à tela inicial")}</>,
            text: <>Em versões novas pode aparecer como {q("Adicionar app à tela inicial")} ou {q("Instalar")}.</>,
            art: <MenuRows rows={[["Nova aba", null], ["Favoritos", rowIcons.star]]} highlight="Adicionar à tela inicial" highlightIcon={rowIcons.home} />,
          },
          { title: <>Confirme em {q("Adicionar")}</>, art: <ConfirmDialog title="Adicionar à tela inicial" action="Adicionar" /> },
          { title: "Pronto: abra pelo ícone", art: <HomeScreen /> },
        ],
      };
    case "android-other":
      return {
        platform,
        label: env.platform === "android-other" ? env.browser : "Outros",
        steps: [
          { title: "Abra o menu do navegador", text: "Normalmente são três pontinhos (⋮) ou três tracinhos (≡).", art: <AddressBar icon={icons.kebab} /> },
          {
            title: <>Procure {q("Instalar app")} ou {q("Adicionar à tela inicial")}</>,
            text: <>No Edge, a opção se chama {q("Adicionar ao telefone")}. Se não encontrar, abra esta página no Chrome.</>,
            art: <MenuRows rows={[["Favoritos", rowIcons.star]]} highlight="Adicionar à tela inicial" highlightIcon={rowIcons.home} />,
          },
          { title: "Pronto: abra pelo ícone", art: <HomeScreen /> },
        ],
      };
    case "desktop-chromium":
      return {
        platform,
        label: "Chrome e Edge",
        steps: [
          {
            title: "Clique no ícone de instalar",
            text: (
              <>
                Fica no fim da barra de endereço. Não apareceu? No Chrome, abra o menu ⋮ → {q("Transmitir, salvar e compartilhar")} → {q("Instalar Estudatta")}. No Edge, menu ••• →{" "}
                {q("Apps")} → {q("Instalar este site como um app")}.
              </>
            ),
            art: <AddressBar icon={icons.install} />,
          },
          { title: <>Confirme em {q("Instalar")}</>, art: <ConfirmDialog title="Instalar app?" action="Instalar" /> },
          { title: "O app abre numa janela própria", text: "Fixe na barra de tarefas (ou no Dock, no Mac) para abrir com um clique.", art: <Dock /> },
        ],
      };
    case "desktop-safari":
      return {
        platform,
        label: "Safari (Mac)",
        steps: [
          {
            title: <>No menu Arquivo, clique em {q("Adicionar ao Dock…")}</>,
            text: "Também dá pelo botão Compartilhar da barra do Safari. Precisa do macOS Sonoma (14) ou mais novo.",
            art: <MacFileMenu />,
          },
          { title: <>Confirme em {q("Adicionar")}</>, art: <ConfirmDialog title="Adicionar ao Dock" action="Adicionar" /> },
          { title: "Abra pelo Dock", text: "O Estudatta abre numa janela própria, sem as barras do navegador.", art: <Dock /> },
        ],
      };
    case "desktop-other":
      return {
        platform,
        label: env.platform === "desktop-other" ? env.browser : "Outros",
        note: <>Este navegador não instala apps no computador.</>,
        steps: [
          { title: "Abra o Estudatta no Chrome ou no Edge", text: "No Mac, o Safari do macOS Sonoma (14) ou mais novo também instala. Depois é só seguir os passos de lá.", action: <CopyLinkButton /> },
          { title: "Ou deixe nos favoritos", text: "Ctrl+D (⌘+D no Mac) salva a página para abrir rapidinho." },
        ],
      };
  }
}

/** Instrução de uma linha para o navegador detectado (ex.: cartão em Preferências). */
export function shortHint(env: InstallEnv): React.ReactNode {
  switch (env.platform) {
    case "ios-safari":
      return <>No Safari, toque em Compartilhar e depois em {q("Adicionar à Tela de Início")}.</>;
    case "ios-other":
      return <>No {env.browser}, toque em Compartilhar e depois em {q("Adicionar à Tela de Início")}.</>;
    case "ios-other-legacy":
      return <>Nesta versão do iOS, abra no Safari e toque em Compartilhar → {q("Adicionar à Tela de Início")}.</>;
    case "android-chrome":
      return <>No Chrome, toque no menu ⋮ e depois em {q("Instalar app")}.</>;
    case "android-samsung":
      return <>No Samsung Internet, toque no menu ≡ → {q("Adicionar página a")} → {q("Tela inicial")}.</>;
    case "android-firefox":
      return <>No Firefox, toque no menu ⋮ e depois em {q("Adicionar à tela inicial")}.</>;
    case "android-other":
      return <>No menu do navegador, procure {q("Instalar app")} ou {q("Adicionar à tela inicial")}.</>;
    case "desktop-chromium":
      return <>No {env.browser}, clique no ícone de instalar no fim da barra de endereço.</>;
    case "desktop-safari":
      return <>No Safari, vá em Arquivo → {q("Adicionar ao Dock…")}.</>;
    case "desktop-other":
      return <>Este navegador não instala apps. Use Chrome, Edge ou o Safari do Mac.</>;
    case "in-app":
      return <>Abra esta página no navegador (menu ••• → {q("Abrir no navegador")}) para instalar.</>;
  }
}
