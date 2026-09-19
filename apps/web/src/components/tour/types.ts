import type { TataMood } from "@/components/mascot/TataSvg";

/**
 * Um passo do tour. `target` é o valor de `data-tour="..."` do elemento a destacar; sem alvo
 * (ou alvo ausente na tela), o passo aparece centralizado. `optional` pula o passo quando o
 * alvo não existe (ex.: um botão que só aparece com dados).
 */
export interface TourStep {
  target?: string;
  title: string;
  body: string;
  mood?: TataMood;
  optional?: boolean;
}

/** Tour de uma página. `key`: minúsculas, números e hífen (é o que o servidor guarda). */
export interface TourDef {
  key: string;
  title: string;
  steps: TourStep[];
}
