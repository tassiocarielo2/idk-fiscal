/**
 * Janelas legais para eventos pos-emissao da NF-e (modelo 55, ES).
 * Backend tambem valida (RPC register_nfe_event), aqui e front-end check.
 */

export type NFeEventWindow = {
  tipo: "cancelamento" | "cce" | "epec";
  codigo: string;       // codigo SEFAZ
  windowHours: number;  // 0 = sem janela
};

export const EVENT_WINDOWS: Record<string, NFeEventWindow> = {
  cancelamento: { tipo: "cancelamento", codigo: "110111", windowHours: 24 },
  cce:          { tipo: "cce",          codigo: "110110", windowHours: 24 * 30 },
  epec:         { tipo: "epec",         codigo: "110140", windowHours: 0 },
};

export function isWithinWindow(
  authorizedAt: Date,
  window: NFeEventWindow,
  now: Date = new Date(),
): boolean {
  if (window.windowHours === 0) return true;
  const elapsedMs = now.getTime() - authorizedAt.getTime();
  return elapsedMs <= window.windowHours * 3600 * 1000;
}
