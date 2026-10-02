/**
 * Decide se a sessão ativa do servidor deve virar cronômetro neste aparelho.
 *
 * A tela da sessão adota sozinha a sessão que ficou aberta no mesmo aparelho (recarregou a página,
 * fechou o app). O cuidado é não adotar uma sessão que acabamos de encerrar aqui: entre o encerrar
 * e a resposta do refetch, o cache de `/sessions/active` ainda guarda a sessão antiga, e sem essa
 * guarda o cronômetro voltava sozinho — com o "Em sessão" reaparecendo na tela Hoje.
 */
export interface AdoptInput {
  /** o cronômetro local já foi lido do IndexedDB */
  hydrated: boolean;
  hasUser: boolean;
  /** cronômetro local (null = nenhum neste aparelho) */
  hasLocalTimer: boolean;
  /** sessão aberta no servidor, se houver */
  serverActive: { id: string; device_id?: string | null } | null;
  /** identificador deste aparelho */
  deviceId: string | null;
  /** sessões encerradas/descartadas nesta visita — nunca readotadas */
  endedHere: ReadonlySet<string>;
}

export function shouldAdopt(i: AdoptInput): boolean {
  if (!i.hydrated || !i.hasUser || i.hasLocalTimer || !i.serverActive) return false;
  if (i.endedHere.has(i.serverActive.id)) return false;
  // de outro aparelho: só com transferência explícita ("Continuar neste aparelho")
  if (i.serverActive.device_id && i.serverActive.device_id !== i.deviceId) return false;
  return true;
}
