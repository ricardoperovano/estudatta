/**
 * Cronômetro esquecido: uma sessão aberta há tantas horas que quase certamente não é estudo em
 * curso. Enquanto fica aberta, ela ocupa todo o tempo desde que começou (registros manuais com
 * horário são recusados) e a tela Hoje mostrava só um contador absurdo. O mesmo limite vale no
 * servidor para decidir se um lembrete deve ser calado (`STUDYING_MAX`).
 */
export const FORGOTTEN_AFTER_MS = 6 * 60 * 60 * 1000;

export function isForgottenTimer(startedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!startedAt) return false;
  const start = Date.parse(startedAt);
  return Number.isFinite(start) && now - start >= FORGOTTEN_AFTER_MS;
}
