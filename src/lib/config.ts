/**
 * Laufzeit-Overrides per URL-Parameter – nur für Tests gegen eine
 * lokale Instanz von @atproto/dev-env nötig:
 *
 *   http://127.0.0.1:5173/?pds=http://127.0.0.1:2582&plc=http://127.0.0.1:2583
 *
 *   pds      – PDS-Adresse (XRPC + OAuth). OHNE Angabe: PDS aus dem DID-Dokument.
 *              Vorsicht: Der Server prüft den DPoP-"htu" gegen seine eigene
 *              publicUrl – ein Host-Override (z.B. 127.0.0.1 statt localhost)
 *              bricht den Flow mit "DPoP htu mismatch". Nur setzen, wenn es
 *              wirklich nötig ist.
 *   plc      – PLC-Verzeichnis-Basis-URL. Default: https://plc.directory
 *   resolver – Handle-Resolver-Basis-URL. Default: public.api.bsky.app
 *              (dev-env: der PDS selbst löst .test/.example-Handles auf)
 *
 * Ohne Parameter verhält sich die App genau wie in Produktion.
 */

const params = new URLSearchParams(location.search)

function cleanUrl(value: string | null): string | undefined {
  if (!value) return undefined
  return value.replace(/\/+$/, '')
}

export const CONFIG = {
  pds: cleanUrl(params.get('pds')),
  plc: cleanUrl(params.get('plc')) ?? 'https://plc.directory',
  resolver: cleanUrl(params.get('resolver')),
}

/**
 * Overrides zur Laufzeit setzen – nötig, weil der OAuth-Callback auf
 * `/?code=…` landet und die ursprünglichen Query-Parameter (pds/plc/resolver)
 * dabei verloren gehen. Die Werte wandern daher beim Login-Start in die
 * OAuth-Session und werden nach dem Token-Tausch wieder eingesetzt.
 */
export function applyOverrides(overrides: {
  pds?: string
  plc?: string
  resolver?: string
}): void {
  if (overrides.pds !== undefined) CONFIG.pds = cleanUrl(overrides.pds)
  if (overrides.plc !== undefined) CONFIG.plc = cleanUrl(overrides.plc) ?? CONFIG.plc
  if (overrides.resolver !== undefined) CONFIG.resolver = cleanUrl(overrides.resolver)
}

/** Handles der lokalen Testinstanz ([.test]/[.example]) */
export function isTestHandle(handle: string): boolean {
  return /\.(test|example)$/.test(handle)
}

/** Welcher PDS für Login/XRPC genutzt wird (Override oder aus DID-Dokument). */
export function pdsUrlFor(docPdsUrl: string): string {
  return CONFIG.pds ?? docPdsUrl
}

/** Welche Basis-URL Handles auflöst. */
export function resolverUrlFor(): string {
  if (CONFIG.resolver) return CONFIG.resolver
  if (CONFIG.pds) return CONFIG.pds
  return 'https://public.api.bsky.app'
}
