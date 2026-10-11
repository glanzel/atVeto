/**
 * Identity-Auflösung: Handle → DID → DID-Dokument → PDS.
 *
 * Auflösung des Handles läuft über den öffentlichen Blausky-Resolver
 * (public.api.bsky.app), weil DNS-TXT im Browser nicht direkt abfragbar
 * ist. Anschließend wird die Richtung DID → Handle bidirektional verifiziert
 * (DID-Dokument muss `at://<handle>` in `alsoKnownAs` listen) – erst damit
 * ist die Zuordnung Handle ↔ DID vertrauenswürdig.
 */

import { CONFIG, isTestHandle, pdsUrlFor, resolverUrlFor } from './config'

const RESOLVE_ENDPOINT = '/xrpc/com.atproto.identity.resolveHandle'

export interface DidDocument {
  id: string
  alsoKnownAs?: string[]
  verificationMethod?: { id: string; type: string; controller: string; publicKeyMultibase?: string }[]
  service?: { id: string; type: string; serviceEndpoint: string }[]
}

export interface ResolvedIdentity {
  handle: string
  did: string
  doc: DidDocument
  pdsUrl: string
  didKind: 'plc' | 'web' | 'other'
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(
      `Anfrage fehlgeschlagen (${res.status}): ${url}\n${(await res.text()).slice(0, 200)}`,
    )
  }
  return res.json()
}

export async function resolveHandle(handle: string): Promise<string> {
  const base = resolverUrlFor()
  const data = (await fetchJson(
    `${base}${RESOLVE_ENDPOINT}?handle=${encodeURIComponent(handle)}`,
  )) as { did?: string }
  if (!data.did) throw new Error('Handle konnte nicht aufgelöst werden.')
  return data.did
}

export async function fetchDidDocument(did: string): Promise<DidDocument> {
  if (did.startsWith('did:plc:')) {
    return (await fetchJson(
      `${CONFIG.plc}/${encodeURIComponent(did)}`,
    )) as DidDocument
  }
  if (did.startsWith('did:web:')) {
    const host = did
      .slice('did:web:'.length)
      .replace(/%3A/g, ':')
      .replaceAll(':', '/')
    const path = host.includes('/')
      ? `https://${host}/did.json`
      : `https://${host}/.well-known/did.json`
    return (await fetchJson(path)) as DidDocument
  }
  throw new Error(`Nicht unterstützte DID-Methode: ${did.split(':').slice(0, 2).join(':')}`)
}

export function extractPdsUrl(doc: DidDocument): string {
  const svc = doc.service?.find((s) => s.id.endsWith('#atproto_pds'))
  if (!svc?.serviceEndpoint) {
    throw new Error('Im DID-Dokument wurde kein PDS-Endpoint (#atproto_pds) gefunden.')
  }
  return svc.serviceEndpoint.replace(/\/+$/, '')
}

export function didKindOf(did: string): ResolvedIdentity['didKind'] {
  if (did.startsWith('did:plc:')) return 'plc'
  if (did.startsWith('did:web:')) return 'web'
  return 'other'
}

/** Bidirektionale Prüfung: DID-Dokument muss genau diesen Handle listen. */
export function assertHandleClaimed(doc: DidDocument, handle: string): void {
  const expected = `at://${handle}`
  if (!doc.alsoKnownAs?.includes(expected)) {
    throw new Error(
      `Verifikation fehlgeschlagen: ${doc.id} listet "${handle}" nicht in alsoKnownAs. ` +
        'Handle und DID passen nicht zusammen – Abbruch.',
    )
  }
}

export interface PlcOperationData {
  rotationKeys: string[]
  verificationMethods: Record<string, string>
  alsoKnownAs: string[]
  services: Record<string, { type: string; endpoint: string }>
}

/** Aktuellen PLC-Zustand lesen (nur did:plc). */
export async function fetchPlcData(did: string): Promise<PlcOperationData> {
  const data = (await fetchJson(
    `${CONFIG.plc}/${encodeURIComponent(did)}/data`,
  )) as PlcOperationData
  if (!Array.isArray(data.rotationKeys)) {
    throw new Error('PLC-Daten enthalten keine rotationKeys.')
  }
  return data
}

/** Vollständige Identitätsauflösung ab Handle (oder direkt ab DID). */
export async function resolveIdentity(input: string): Promise<ResolvedIdentity> {
  const trimmed = input.trim()
  const isDid = /^did:(plc|web):.+/.test(trimmed)
  const handle = isDid ? '' : trimmed.replace(/^@/, '').toLowerCase()

  let did: string
  try {
    did = isDid ? trimmed : await resolveHandle(handle)
  } catch (err) {
    // Dev-env-Testhandles ohne Testparameter erkennen und hilfreich sein
    if (!isDid && isTestHandle(handle) && !CONFIG.resolver && !CONFIG.pds) {
      throw new Error(
        `„${handle}" ist ein Test-Handle der lokalen dev-env-Instanz und ` +
          'lässt sich nur mit den Testparametern auflösen.\n\n' +
          'Lösung: die vollständige URL aus der Ausgabe von ' +
          '„npm run test:dev-env" öffnen, z.B.\n' +
          'http://127.0.0.1:5173/?resolver=http://127.0.0.1:2582&plc=http://127.0.0.1:2583\n\n' +
          '(Der Login erscheint erst nach Klick auf „Weiter" – auf der Seite ' +
          'des PDS, nicht in dieser App.)',
      )
    }
    throw err
  }

  const kind = didKindOf(did)
  if (kind === 'other') {
    throw new Error(`Nicht unterstützte DID-Methode: ${did}`)
  }
  const doc = await fetchDidDocument(did)
  if (!isDid) assertHandleClaimed(doc, handle)
  const pdsUrl = pdsUrlFor(extractPdsUrl(doc))
  return { handle: handle || did, did, doc, pdsUrl, didKind: kind }
}
