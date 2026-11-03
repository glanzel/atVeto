/**
 * Rotation-Key-Erzeugung im Browser.
 *
 * did:plc akzeptiert für `rotationKeys` sowohl secp256k1- als auch
 * P-256-Keys (Multicodec `p256-pub` = 0x1200, komprimierter 33-Byte-Point,
 * Multibase `z` = base58btc). P-256 hat den Vorteil, dass es direkt von
 * WebCrypto (SubtleCrypto) erzeugt und signiert werden kann – kein
 * externes Krypto-Modul nötig. Der gleiche Schlüsseltyp (ES256) wird
 * später auch für DPoP-Proofs im OAuth-Flow verwendet, ist dort aber
 * ein separates Schlüsselpaar.
 *
 * Privater Schlüssel im Multibase-Format (wie beim Eurosky-Umzug):
 * `z…` = base58btc über [0x86, 0x26] (Multicodec p256-priv) + 32 Byte Scalar.
 * Der öffentliche Schlüssel ist `did:key:zDnae…` (Multicodec p256-pub).
 */

import { base58Encode } from './base58'

const EC_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const

/** Multicodec p256-pub (0x1200) als Varint */
const P256_PUB_MULTICODEC = [0x80, 0x24]
/** Multicodec p256-priv (0x1306) als Varint */
const P256_PRIV_MULTICODEC = [0x86, 0x26]

export interface RotationKeyPair {
  /** did:key des öffentlichen Schlüssels (z. B. did:key:zDnae…) */
  didKey: string
  /** privater Schlüssel als Multibase-String (z…) */
  privateKeyMultibase: string
  /** privates JWK (inkl. d) – nur im Speicher, nie versenden/ablegen */
  privateJwk: JsonWebKey
  publicJwk: JsonWebKey
  createdAt: string
}

export function b64uToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function bytesToB64u(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256B64u(data: Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return bytesToB64u(new Uint8Array(digest))
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return b
}

/** Base64url-Zufallswert für PKCE-Verifier, state, jti … */
export function randomB64u(n: number): string {
  return bytesToB64u(randomBytes(n))
}

/** did:key (P-256, komprimiert) aus einem öffentlichen JWK ableiten. */
export function didKeyFromPublicJwk(publicJwk: JsonWebKey): string {
  if (!publicJwk.x || !publicJwk.y) {
    throw new Error('Öffentliches JWK ohne x/y-Koordinaten')
  }
  const x = b64uToBytes(publicJwk.x)
  const y = b64uToBytes(publicJwk.y)
  if (x.length !== 32 || y.length !== 32) {
    throw new Error(`Unerwartete Koordinatenlänge: ${x.length}/${y.length}`)
  }
  // Komprimierter SEC1-Point: 0x02 (gerades y) bzw. 0x03 (ungerades y)
  const compressed = new Uint8Array(33)
  compressed[0] = (y[31] & 1) === 1 ? 0x03 : 0x02
  compressed.set(x, 1)
  const prefixed = new Uint8Array(P256_PUB_MULTICODEC.length + compressed.length)
  prefixed.set(P256_PUB_MULTICODEC, 0)
  prefixed.set(compressed, P256_PUB_MULTICODEC.length)
  return `did:key:z${base58Encode(prefixed)}`
}

/** Privaten Scalar ins Multibase-Format bringen (kompatibel zu EU-HAUL). */
export function privateKeyMultibaseFromJwk(privateJwk: JsonWebKey): string {
  if (!privateJwk.d) throw new Error('Privates JWK ohne d-Anteil')
  const scalar = b64uToBytes(privateJwk.d)
  if (scalar.length !== 32) {
    throw new Error(`Unerwartete Scalarlänge: ${scalar.length}`)
  }
  const prefixed = new Uint8Array(P256_PRIV_MULTICODEC.length + scalar.length)
  prefixed.set(P256_PRIV_MULTICODEC, 0)
  prefixed.set(scalar, P256_PRIV_MULTICODEC.length)
  return `z${base58Encode(prefixed)}`
}

/** Neues P-256-Schlüsselpaar für die DID-Rotation erzeugen. */
export async function generateRotationKey(): Promise<RotationKeyPair> {
  const pair = await crypto.subtle.generateKey(EC_P256, true, ['sign'])
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return {
    didKey: didKeyFromPublicJwk(publicJwk),
    privateKeyMultibase: privateKeyMultibaseFromJwk(privateJwk),
    privateJwk,
    publicJwk,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Sicherungsdatei im Multibase-Format (bewusst kein JSON): der private
 * Schlüssel steht als eine Zeile darin, der öffentliche als did:key.
 */
export function keyBackupText(
  key: RotationKeyPair,
  meta: { did: string; handle: string },
): string {
  return [
    'atVeto recovery key (P-256, multibase)',
    '',
    `did:      ${meta.did}`,
    `handle:   ${meta.handle}`,
    `public:   ${key.didKey}`,
    `private:  ${key.privateKeyMultibase}`,
    `created:  ${key.createdAt}`,
    '',
    'Der private Schlüssel ist der Recovery-Schlüssel für die DID.',
    'Nicht weitergeben, nicht in Cloud/Notizen ablegen.',
  ].join('\n')
}

/** Privaten CryptoKey aus einem JWK für DPoP-Signaturen importieren. */
export async function importEs256Signer(
  jwk: JsonWebKey,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    EC_P256,
    false /* nicht extrahierbar */,
    ['sign'],
  )
}
