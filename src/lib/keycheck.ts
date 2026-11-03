/**
 * Parsen und Prüfen privater Recovery-Keys.
 *
 * Unterstützte Eingaben:
 *  1. Multibase-Private-Key (`z…`, 48 Zeichen, Multicodec 0x1306) – das
 *     Format, das auch Eurosky beim Umzug ausgibt.
 *  2. atVeto-Backup-Datei (Text mit `private:`, `public:`, `did:`, …).
 */

import { base58Encode } from './base58'
import { b64uToBytes, didKeyFromPublicJwk } from './keys'
import { compressedPublicKeyFromScalar, isValidP256Scalar } from './p256'

const P256_PUB_MULTICODEC = [0x80, 0x24]
const P256_PRIV_MULTICODEC = [0x86, 0x26]

export interface ParsedKey {
  /** Erkannter Eingabetyp */
  format: 'multibase' | 'backup'
  scalar: Uint8Array
  /** Metadaten, falls ein atVeto-Backup eingelesen wurde */
  meta: {
    did?: string
    handle?: string
    publicDidKey?: string
    createdAt?: string
  }
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Decode(value: string): Uint8Array {
  const bytes: number[] = [0]
  for (const ch of value) {
    const val = BASE58_ALPHABET.indexOf(ch)
    if (val < 0) throw new Error(`Ungültiges Base58-Zeichen: ${ch}`)
    let carry = val
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  // führende '1' = führende Null-Bytes
  let zeros = 0
  while (zeros < value.length && value[zeros] === '1') zeros++
  const out = new Uint8Array(bytes.length + zeros)
  out.set(new Uint8Array(bytes.reverse()), zeros)
  return out
}

/** `private: z…`-Zeile aus einem atVeto-Backup lesen. */
function parseBackupText(text: string): ParsedKey | null {
  const lines = text.split(/\r?\n/)
  const fields = new Map<string, string>()
  for (const line of lines) {
    const match = /^\s*([a-zA-Z]+):\s*(\S.*?)\s*$/.exec(line)
    if (match) fields.set(match[1].toLowerCase(), match[2])
  }
  const privateValue = fields.get('private')
  if (!privateValue) return null

  const parsed = parseMultibasePrivate(privateValue)
  if (!parsed) return null
  return {
    ...parsed,
    format: 'backup',
    meta: {
      did: fields.get('did'),
      handle: fields.get('handle'),
      publicDidKey: fields.get('public'),
      createdAt: fields.get('created'),
    },
  }
}

function parseMultibasePrivate(value: string): ParsedKey | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('z')) return null

  const decoded = base58Decode(trimmed.slice(1))
  if (
    decoded.length !== 34 ||
    decoded[0] !== P256_PRIV_MULTICODEC[0] ||
    decoded[1] !== P256_PRIV_MULTICODEC[1]
  ) {
    return null
  }
  const scalar = decoded.slice(2)
  if (!isValidP256Scalar(scalar)) return null
  return { format: 'multibase', scalar, meta: {} }
}

/** Beliebige Eingabe (Multibase oder Backup-Text) parsen. */
export function parseKeyInput(text: string): ParsedKey {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Kein Schlüssel eingegeben')

  const backup = trimmed.includes(':')
    ? parseBackupText(trimmed)
    : null
  if (backup) return backup

  const multibase = parseMultibasePrivate(trimmed)
  if (multibase) return multibase

  throw new Error(
    'Format nicht erkannt. Erwartet: Multibase-Schlüssel (z…, 48 Zeichen) ' +
      'oder eine atVeto-Backup-Datei.',
  )
}

/** did:key des öffentlichen Schlüssels aus dem privaten Scalar ableiten. */
export function didKeyFromScalar(scalar: Uint8Array): string {
  const compressed = compressedPublicKeyFromScalar(scalar)
  const prefixed = new Uint8Array(P256_PUB_MULTICODEC.length + compressed.length)
  prefixed.set(P256_PUB_MULTICODEC, 0)
  prefixed.set(compressed, P256_PUB_MULTICODEC.length)
  return `did:key:z${base58Encode(prefixed)}`
}

/** Gegenprobe: abgeleiteter Key vs. in der Datei gespeicherter Public-Key. */
export function publicKeyMatches(
  derivedDidKey: string,
  storedDidKey: string | undefined,
): boolean | null {
  if (!storedDidKey) return null
  return derivedDidKey === storedDidKey.trim()
}

/** Hilfsfunktion für die Anzeige: did:key aus JWK (für Gegenproben). */
export function didKeyFromJwk(publicJwk: JsonWebKey): string {
  return didKeyFromPublicJwk(publicJwk)
}

export { b64uToBytes }
