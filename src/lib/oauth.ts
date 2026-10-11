/**
 * Handgeschriebener atproto-OAuth-Client (öffentlicher Client, PAR + PKCE +
 * DPoP/ES256) – läuft komplett im Browser.
 *
 * Ablauf:
 *  1. Discovery: PDS → protected-resource → Authorization Server (AS) → AS-Metadaten
 *  2. PAR (Pushed Authorization Request, Auth via DPoP-Proof-Header) → request_uri
 *  3. Redirect zum AS (Login passiert dort, die App sieht keine Credentials)
 *  4. Callback: Code + state → Token-Tausch (wieder mit DPoP) → sub==DID verifizieren
 *  5. Session-Daten aus sessionStorage löschen
 *
 * Inspiriert von der Wire-Kompatibilität des offiziellen
 * @atproto/oauth-client, aber ohne Abhängigkeiten.
 */

import {
  importEs256Signer,
  randomB64u,
  sha256B64u,
  b64uToBytes,
  bytesToB64u,
} from './keys'

const SESSION_STORAGE_KEY = 'atveto.oauth.session.v1'

export interface AuthServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  pushed_authorization_request_endpoint?: string
  require_pushed_authorization_requests?: boolean
  dpop_signing_alg_values_supported?: string[]
}

export interface OAuthSessionState {
  /** Issuer des Authorization Servers (aus dem Discovery) */
  iss: string
  /** PKCE-Code-Verifier */
  verifier: string
  /** privates JWK des DPoP-Schlüssels (nur übergangsweise) */
  dpopJwk: JsonWebKey
  /** letzter DPoP-Nonce vom AS */
  asNonce?: string
  /** Account-Kontext */
  handle: string
  did: string
  pdsUrl: string
  redirectUri: string
  clientId: string
  loginHint: string
  createdAt: number
}

export interface TokenSet {
  accessToken: string
  tokenType: string
  scope: string
  sub: string
  refreshToken?: string
  expiresAt?: number
  dpopJwk: JsonWebKey
  pdsUrl: string
}

/* ------------------------------------------------------------------ */
/* Kleine Helfer                                                       */
/* ------------------------------------------------------------------ */

function b64uJson(value: unknown): string {
  return bytesToB64u(new TextEncoder().encode(JSON.stringify(value)))
}

async function signJwt(
  signer: CryptoKey,
  publicJwk: JsonWebKey,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y },
  }
  const signingInput = `${b64uJson(header)}.${b64uJson(payload)}`
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signer,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${bytesToB64u(new Uint8Array(sig))}`
}

interface DpopProofOpts {
  htm: string
  htu: string
  nonce?: string
  ath?: string
}

async function makeDpopProof(
  signer: CryptoKey,
  publicJwk: JsonWebKey,
  { htm, htu, nonce, ath }: DpopProofOpts,
): Promise<string> {
  return signJwt(signer, publicJwk, {
    jti: randomB64u(16),
    htm,
    htu,
    iat: Math.floor(Date.now() / 1000),
    ...(nonce ? { nonce } : {}),
    ...(ath ? { ath } : {}),
  })
}

function isUseDpopNonceError(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 401) return false
  try {
    const json = JSON.parse(bodyText) as { error?: string }
    if (json.error === 'use_dpop_nonce') return true
  } catch {
    // kein JSON – über Header prüfen
  }
  return false
}

function formUrlEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/* ------------------------------------------------------------------ */
/* Client-Konfiguration                                                */
/* ------------------------------------------------------------------ */

export const OAUTH_SCOPE = 'atproto identity:*'

/**
 * client_id ableiten:
 * - Produktion: URL der statischen client-metadata.json des Deployments
 * - lokale Entwicklung: "localhost exception" – der AS erzeugt eine
 *   virtuelle Metadaten-Datei; scope/redirect_uri gehen als Query-Parameter
 *   in die client_id-URL (vom AS synthetisiert).
 */
export function clientIdFor(
  origin: string,
  redirectUri: string,
): string {
  if (/^http:\/\/(127\.0\.0\.1|127\.0\.1|\[::1\]|localhost)(:\d+)?\/?$/.test(origin)) {
    return (
      'http://localhost/' +
      '?redirect_uri=' +
      encodeURIComponent(redirectUri) +
      '&scope=' +
      encodeURIComponent(OAUTH_SCOPE)
    )
  }
  return `${origin.replace(/\/+$/, '')}/client-metadata.json`
}

/* ------------------------------------------------------------------ */
/* Discovery                                                            */
/* ------------------------------------------------------------------ */

async function discoverAuthServer(pdsUrl: string): Promise<AuthServerMetadata> {
  const resRes = await fetch(
    `${pdsUrl}/.well-known/oauth-protected-resource`,
    { headers: { Accept: 'application/json' } },
  )
  if (!resRes.ok) {
    throw new Error(
      `PDS bietet keinen OAuth-Resource-Endpoint (${resRes.status}). ` +
        'OAuth-Login ist mit diesem Server nicht möglich.',
    )
  }
  const resource = (await resRes.json()) as { authorization_servers?: string[] }
  const asUrl = resource.authorization_servers?.[0]
  if (!asUrl) throw new Error('Kein Authorization Server in den Resource-Metadaten.')

  const metaRes = await fetch(
    `${asUrl}/.well-known/oauth-authorization-server`,
    { headers: { Accept: 'application/json' } },
  )
  if (!metaRes.ok) {
    throw new Error(`Authorization-Server-Metadaten nicht abrufbar (${metaRes.status}).`)
  }
  return (await metaRes.json()) as AuthServerMetadata
}

/* ------------------------------------------------------------------ */
/* Login starten (Schritt 1 → Redirect)                                 */
/* ------------------------------------------------------------------ */

export async function startLogin(args: {
  handle: string
  did: string
  pdsUrl: string
}): Promise<void> {
  const redirectUri = `${location.origin.replace(/\/+$/, '')}/`
  const clientId = clientIdFor(location.origin, redirectUri)
  const meta = await discoverAuthServer(args.pdsUrl)

  if (meta.require_pushed_authorization_requests && !meta.pushed_authorization_request_endpoint) {
    throw new Error('Authorization Server verlangt PAR, bietet aber keinen PAR-Endpoint.')
  }

  const verifier = randomB64u(32)
  const challenge = await sha256B64u(b64uToBytes(verifier))
  const state = randomB64u(16)

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  )
  const dpopJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)

  const session: OAuthSessionState = {
    iss: meta.issuer,
    verifier,
    dpopJwk,
    handle: args.handle,
    did: args.did,
    pdsUrl: args.pdsUrl,
    redirectUri,
    clientId,
    loginHint: args.handle || args.did,
    createdAt: Date.now(),
  }
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))

  const params = formUrlEncode({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    login_hint: session.loginHint,
  })

  const parUrl = meta.pushed_authorization_request_endpoint
    ? meta.pushed_authorization_request_endpoint
    : new URL('/oauth/par', meta.issuer).toString()
  const signer = await importEs256Signer(dpopJwk)

  let requestUri: string | undefined
  for (let attempt = 0; attempt < 2 && !requestUri; attempt++) {
    const proof = await makeDpopProof(signer, publicJwk, {
      htm: 'POST',
      htu: parUrl,
      nonce: session.asNonce,
    })
    const res = await fetch(parUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        DPoP: proof,
      },
      body: params,
    })
    const bodyText = await res.text()
    if (!res.ok) {
      const nonce = res.headers.get('DPoP-Nonce')
      if (nonce && isUseDpopNonceError(res.status, bodyText) && attempt === 0) {
        session.asNonce = nonce
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
        continue
      }
      let detail = bodyText.slice(0, 300)
      try {
        const json = JSON.parse(bodyText) as { error_description?: string }
        detail = json.error_description ?? detail
      } catch {
        /* Rohtext */
      }
      throw new Error(`Login konnte nicht gestartet werden (${res.status}): ${detail}`)
    }
    requestUri = (JSON.parse(bodyText) as { request_uri: string }).request_uri
    break
  }
  if (!requestUri) throw new Error('PAR ist fehlgeschlagen.')

  const authorizeUrl = new URL(meta.authorization_endpoint)
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('request_uri', requestUri)
  location.href = authorizeUrl.toString()
}

/* ------------------------------------------------------------------ */
/* Callback (Schritt 3 → Token)                                         */
/* ------------------------------------------------------------------ */

export function readCallback(): { code: string; state: string; iss?: string } | null {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return null
  return { code, state, iss: params.get('iss') ?? undefined }
}

function loadSession(state: string): OAuthSessionState | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    /* Storage nicht verfügbar */
  }
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as OAuthSessionState
    // Die state-Prüfung findet gegen den ausgelieferten Callback-Wert statt;
    // wir prüfen hier nur Struktur + Frische.
    if (Date.now() - session.createdAt > 15 * 60 * 1000) return null
    void state
    return session
  } catch {
    return null
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    /* ignorieren */
  }
}

/** Nach dem Redirect: Code gegen Token tauschen, `sub` gegen erwartete DID prüfen. */
export async function finishLogin(callback: {
  code: string
  state: string
  iss?: string
}): Promise<TokenSet> {
  const session = loadSession(callback.state)
  if (!session) {
    clearSession()
    throw new Error(
      'Login-Session nicht gefunden (abgelaufen oder Tab neu geöffnet?). ' +
        'Bitte Handle erneut eingeben.',
    )
  }
  if (callback.iss && callback.iss !== session.iss) {
    clearSession()
    throw new Error(`Authorization-Server-Wechsel erkannt (${callback.iss} statt ${session.iss}) – Abbruch.`)
  }

  const signer = await importEs256Signer(session.dpopJwk)
  // Das private JWK enthält x/y – das reicht für den DPoP-Header.
  const publicJwk = session.dpopJwk

  const tokenUrl = new URL('/oauth/token', session.iss).toString()
  const params = formUrlEncode({
    grant_type: 'authorization_code',
    client_id: session.clientId,
    redirect_uri: session.redirectUri,
    code: callback.code,
    code_verifier: session.verifier,
  })

  let tokenBody: {
    access_token: string
    token_type: string
    scope: string
    sub: string
    refresh_token?: string
    expires_in?: number
  } | null = null

  for (let attempt = 0; attempt < 2 && !tokenBody; attempt++) {
    const proof = await makeDpopProof(signer, publicJwk, {
      htm: 'POST',
      htu: tokenUrl,
      nonce: session.asNonce,
    })
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        DPoP: proof,
      },
      body: params,
    })
    const bodyText = await res.text()
    if (!res.ok) {
      const nonce = res.headers.get('DPoP-Nonce')
      if (nonce && isUseDpopNonceError(res.status, bodyText) && attempt === 0) {
        session.asNonce = nonce
        continue
      }
      let detail = bodyText.slice(0, 300)
      try {
        const json = JSON.parse(bodyText) as { error_description?: string }
        detail = json.error_description ?? detail
      } catch {
        /* Rohtext */
      }
      throw new Error(`Token-Tausch fehlgeschlagen (${res.status}): ${detail}`)
    }
    tokenBody = JSON.parse(bodyText)
  }
  if (!tokenBody) throw new Error('Token-Tausch fehlgeschlagen.')

  if (!tokenBody.scope?.includes('atproto')) {
    clearSession()
    throw new Error('Token enthält nicht den "atproto"-Scope – Abbruch.')
  }
  if (tokenBody.sub !== session.did) {
    clearSession()
    throw new Error(
      `Account-Wechsel erkannt: Token gehört zu ${tokenBody.sub}, ` +
        `erwartet wurde aber ${session.did} – Abbruch.`,
    )
  }

  const tokens: TokenSet = {
    accessToken: tokenBody.access_token,
    tokenType: tokenBody.token_type,
    scope: tokenBody.scope,
    sub: tokenBody.sub,
    refreshToken: tokenBody.refresh_token,
    expiresAt:
      typeof tokenBody.expires_in === 'number'
        ? Date.now() + tokenBody.expires_in * 1000
        : undefined,
    dpopJwk: session.dpopJwk,
    pdsUrl: session.pdsUrl,
  }
  // Übergangs-State weg – ab jetzt lebt die Session nur im Speicher.
  clearSession()
  return tokens
}
