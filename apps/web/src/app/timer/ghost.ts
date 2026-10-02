/**
 * Cronômetro "fantasma": ficou salvo neste aparelho, mas a sessão não existe mais no servidor
 * (foi encerrada aqui num momento em que a tela não limpou, ou encerrada em outro aparelho).
 * Sem isto, a tela Hoje segue dizendo "Em sessão" até a pessoa entrar e encerrar de novo.
 *
 * A limpeza é conservadora: só descarta o que o servidor comprovadamente já não tem.
 */
export interface GhostInput {
  /** cronômetro guardado neste aparelho */
  timer: { session_id: string | null; synced?: boolean; started_at: string } | null;
  /** sessão aberta segundo o servidor (null = nenhuma) */
  serverActive: { id: string } | null;
  /** a consulta de sessão ativa respondeu com sucesso */
  serverAnswered: boolean;
  /** quando essa resposta chegou (ms) */
  answeredAt: number;
  online: boolean;
}

export function isGhostTimer(i: GhostInput): boolean {
  const t = i.timer;
  if (!t || !i.online || !i.serverAnswered) return false;
  // sessão criada offline ainda não enviada: só existe aqui, nunca descartar
  if (!t.session_id || t.synced === false) return false;
  // o servidor segue com esta mesma sessão aberta
  if (i.serverActive && i.serverActive.id === t.session_id) return false;
  // a resposta precisa ser posterior ao início do cronômetro; senão pode ser uma resposta
  // antiga, de antes de a sessão começar (ex.: começou no celular, este aparelho com cache)
  const startedAt = Date.parse(t.started_at);
  if (!Number.isFinite(startedAt) || i.answeredAt <= startedAt) return false;
  return true;
}
