import * as React from "react";
import type { RouteObject } from "react-router";
import { AppShell } from "@/components/app/shell";
import { RedirectIfAuthed, RequireAdmin, RequireAuth } from "./guards";
import { SiteLayout } from "@/site/layout";
import { HomePage } from "@/site/pages/home";
import { ErrorPage } from "./error-page";

const lazy = (loader: () => Promise<{ default: React.ComponentType }>) => {
  const C = React.lazy(loader);
  return (
    <React.Suspense fallback={null}>
      <C />
    </React.Suspense>
  );
};

/** Rotas públicas (pré-renderizadas no build) + app privado + admin. */
export const routes: RouteObject[] = [
  {
    element: <SiteLayout />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/ingles", element: lazy(() => import("@/site/pages/ingles")) },
      { path: "/concursos", element: lazy(() => import("@/site/pages/concursos")) },
      { path: "/planos", element: lazy(() => import("@/site/pages/planos")) },
      { path: "/faq", element: lazy(() => import("@/site/pages/faq")) },
      { path: "/contato", element: lazy(() => import("@/site/pages/contato")) },
      { path: "/privacidade", element: lazy(() => import("@/site/pages/privacidade")) },
      { path: "/termos", element: lazy(() => import("@/site/pages/termos")) },
    ],
  },
  {
    element: <RedirectIfAuthed />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/entrar", element: lazy(() => import("@/app/auth/login")) },
      { path: "/cadastro", element: lazy(() => import("@/app/auth/register")) },
      { path: "/recuperar-senha", element: lazy(() => import("@/app/auth/forgot")) },
      { path: "/redefinir-senha", element: lazy(() => import("@/app/auth/reset")) },
    ],
  },
  { path: "/confirmar-email", element: lazy(() => import("@/app/auth/verify")), errorElement: <ErrorPage /> },
  {
    element: <RequireAuth />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/onboarding", element: lazy(() => import("@/app/onboarding/page")) },
      {
        path: "/app",
        element: <AppShell />,
        children: [
          { index: true, element: lazy(() => import("@/app/today/page")) },
          { path: "sessao", element: lazy(() => import("@/app/timer/page")) },
          { path: "plano", element: lazy(() => import("@/app/plan/page")) },
          { path: "plano/imprimir", element: lazy(() => import("@/app/plan/print")) },
          { path: "objetivos", element: lazy(() => import("@/app/activities/list")) },
          { path: "objetivos/novo", element: lazy(() => import("@/app/activities/new")) },
          { path: "objetivos/:id", element: lazy(() => import("@/app/activities/detail")) },
          { path: "objetivos/:id/recuperar", element: lazy(() => import("@/app/recovery/page")) },
          { path: "relatorio", element: lazy(() => import("@/app/reports/page")) },
          { path: "preferencias", element: lazy(() => import("@/app/settings/page")) },
          { path: "planos", element: lazy(() => import("@/app/billing/page")) },
          { path: "notificacoes", element: lazy(() => import("@/app/notifications/page")) },
          { path: "materiais", element: lazy(() => import("@/app/materials/page")) },
          { path: "importar", element: lazy(() => import("@/app/imports/page")) },
        ],
      },
    ],
  },
  {
    element: <RequireAdmin />,
    errorElement: <ErrorPage />,
    children: [{ path: "/admin/*", element: lazy(() => import("@/app/admin/page")) }],
  },
  { path: "*", element: lazy(() => import("@/site/pages/not-found")), errorElement: <ErrorPage /> },
];
