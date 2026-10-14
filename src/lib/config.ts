/**
 * Laufzeit-Konfiguration.
 *
 * URL-Parameter (`?pds=`, `?plc=`, `?resolver=`) sind NUR im Dev-Modus
 * (`npm run dev`) aktiv. In Produktions-Builds ersetzt Vite
 * `import.meta.env.DEV` durch `false` – der Lesezweig fällt dann dem
 * Minifier zum Opfer. Die veröffentlichte App folgt damit ausschließlich
 * dem Account (PDS-Adresse aus dem DID-Dokument) und lässt sich durch
 * URL-Parameter nicht verbiegen.
 *
 * Warum es die Parameter überhaupt gibt: zum Testen gegen eine lokale
 * @atproto/dev-env-Instanz, deren Handles (alice.test) der öffentliche
 * Resolver nicht kennt und deren PLC-Verzeichnis lokal läuft.
 */

const isDev = import.meta.env.DEV
const params = isDev
  ? new URLSearchParams(location.search)
  : new URLSearchParams()

function cleanUrl(value: string | null): string | undefined {
  if (!value) return undefined
  return value.replace(/\/+$/, '')
}

export const CONFIG = {
  pds: cleanUrl(params.get('pds')),
  plc: cleanUrl(params.get('plc')) ?? 'https://plc.directory',
  resolver: cleanUrl(params.get('resolver')),
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
