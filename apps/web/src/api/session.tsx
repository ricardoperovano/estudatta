/** Sessão do usuário: cookie HttpOnly no servidor; aqui só o perfil, CSRF e direitos. */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setCsrfToken, unwrap, ApiError } from "./client";
import type { AuthState as SessionOut, Entitlements, PublicConfig, User } from "./types";
import { clearPrivateData } from "@/offline/db";
import { locale as uiLocale, syncLocaleFromAccount } from "@/i18n";

export const sessionKey = ["auth", "session"] as const;
export const configKey = ["auth", "config"] as const;

export async function fetchSession(): Promise<SessionOut | null> {
  const res = await api.GET("/api/v1/auth/session");
  if (res.response.status === 401) return null;
  const data = unwrap(res);
  setCsrfToken(data.csrf_token);
  // a conta manda: se o idioma salvo no servidor difere do aparelho, recarrega no idioma da conta
  syncLocaleFromAccount(data.user?.locale);
  return data;
}

export async function fetchConfig(): Promise<PublicConfig> {
  return unwrap(await api.GET("/api/v1/auth/config"));
}

export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: fetchSession, staleTime: 5 * 60_000, retry: false });
}

export function usePublicConfig() {
  return useQuery({ queryKey: configKey, queryFn: fetchConfig, staleTime: 30 * 60_000 });
}

export function useUser(): User | null {
  const { data } = useSession();
  return data?.user ?? null;
}

export function useEntitlements(): Entitlements | null {
  const { data } = useSession();
  return data?.entitlements ?? null;
}

export function useAuthActions() {
  const qc = useQueryClient();
  const apply = (data: SessionOut) => {
    setCsrfToken(data.csrf_token);
    qc.setQueryData(sessionKey, data);
  };
  return {
    async login(email: string, password: string) {
      const data = unwrap(await api.POST("/api/v1/auth/login", { body: { email, password } }));
      apply(data);
      return data;
    },
    async register(email: string, password: string, name: string, timezone: string) {
      const data = unwrap(
        await api.POST("/api/v1/auth/register", {
          body: { email, password, name, timezone, locale: uiLocale },
        }),
      );
      apply(data);
      return data;
    },
    async logout() {
      try {
        await api.POST("/api/v1/auth/logout");
      } catch {
        /* offline: limpa localmente mesmo assim */
      }
      setCsrfToken(null);
      await clearPrivateData();
      qc.clear();
      qc.setQueryData(sessionKey, null);
    },
    async refresh() {
      const data = await fetchSession();
      qc.setQueryData(sessionKey, data);
      return data;
    },
  };
}

export function isUnauthorized(e: unknown) {
  return e instanceof ApiError && e.status === 401;
}

export const SessionContext = React.createContext<SessionOut | null>(null);
