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
 */

import { base58Encode } from './base58'

const EC_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const

export interface RotationKeyPair {
  /** did:key des öffentlichen Schlüssels (z. B. did:key:zDn…) */
  didKey: string
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
  // Multicodec p256-pub (0x1200) als Varint: [0x80, 0x24]
  const multicodec = [0x80, 0x24]
  const prefixed = new Uint8Array(multicodec.length + compressed.length)
  prefixed.set(multicodec, 0)
  prefixed.set(compressed, multicodec.length)
  return `did:key:z${base58Encode(prefixed)}`
}

/** Neues P-256-Schlüsselpaar für die DID-Rotation erzeugen. */
export async function generateRotationKey(): Promise<RotationKeyPair> {
  const pair = await crypto.subtle.generateKey(EC_P256, true, ['sign'])
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return {
    didKey: didKeyFromPublicJwk(publicJwk),
    privateJwk,
    publicJwk: publicJwk,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Sicherheitsdatei für den Nutzer: privater JWK + Metadaten.
 * Wird nur auf Knopfdruck als Download erzeugt.
 */
export function keyBackupFile(
  key: RotationKeyPair,
  meta: { did: string; handle: string },
): string {
  return JSON.stringify(
    {
      type: 'atveto-rotation-key/v1',
      warning:
        'PRIVATER SCHLÜSSEL – nicht weitergeben, nicht in Cloud/Notizen ablegen. ' +
        'Mit diesem Schlüssel kann die DID wiederhergestellt bzw. rotiert werden.',
      did: meta.did,
      handle: meta.handle,
      didKey: key.didKey,
      createdAt: key.createdAt,
      publicJwk: key.publicJwk,
      privateJwk: key.privateJwk,
    },
    null,
    2,
  )
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
