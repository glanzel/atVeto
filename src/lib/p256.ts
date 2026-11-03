/**
 * P-256-Punktarithmetik für die Ableitung des öffentlichen Schlüssels aus
 * einem privaten Scalar (reines BigInt, keine Abhängigkeiten).
 *
 * WebCrypto kann das nicht: es kann einen öffentlichen Punkt nicht aus einem
 * privaten Scalar berechnen (nur signieren/verifizieren mit vollständigem
 * Schlüsselpaar). Deshalb hier Double-and-Add auf der Kurve.
 *
 * Wird nur für die "Schlüssel prüfen"-Seite genutzt – der reguläre Flow
 * erzeugt Schlüsselpaare direkt über WebCrypto.
 */

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
const GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n
const GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n

type Point = [bigint, bigint] | null

function mod(value: bigint, m: bigint): bigint {
  const r = value % m
  return r < 0n ? r + m : r
}

function modInv(value: bigint, m: bigint): bigint {
  let t = 0n
  let newT = 1n
  let r = m
  let newR = mod(value, m)
  while (newR !== 0n) {
    const q = r / newR
    ;[t, newT] = [newT, t - q * newT]
    ;[r, newR] = [newR, r - q * newR]
  }
  if (r !== 1n) throw new Error('Wert ist nicht invertierbar')
  return mod(t, m)
}

function pointAdd(a: Point, b: Point): Point {
  if (a === null) return b
  if (b === null) return a
  const [x1, y1] = a
  const [x2, y2] = b

  if (x1 === x2) {
    if (mod(y1 + y2, P) === 0n) return null // Gegenpunkt → unendlich
    // Verdopplung
    const lambda = mod((3n * x1 * x1 - 3n) * modInv(2n * y1, P), P)
    const x3 = mod(lambda * lambda - 2n * x1, P)
    return [x3, mod(lambda * (x1 - x3) - y1, P)]
  }

  const lambda = mod((y2 - y1) * modInv(x2 - x1, P), P)
  const x3 = mod(lambda * lambda - x1 - x2, P)
  return [x3, mod(lambda * (x1 - x3) - y1, P)]
}

function scalarMultiply(k: bigint): Point {
  let result: Point = null
  let addend: Point = [GX, GY]
  let n = k
  while (n > 0n) {
    if (n & 1n) result = pointAdd(result, addend)
    addend = pointAdd(addend, addend)
    n >>= 1n
  }
  return result
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  return value
}

/** Prüft, ob die Bytes ein gültiger P-256-Scalar sind (1 ≤ d < n). */
export function isValidP256Scalar(scalar: Uint8Array): boolean {
  if (scalar.length !== 32) return false
  const d = bytesToBigInt(scalar)
  return d > 0n && d < N
}

/**
 * Komprimierten öffentlichen Punkt (33 Byte, SEC1) aus dem privaten Scalar
 * berechnen.
 */
export function compressedPublicKeyFromScalar(scalar: Uint8Array): Uint8Array {
  if (!isValidP256Scalar(scalar)) {
    throw new Error('Ungültiger privater Schlüssel (Scalar außerhalb 1…n-1)')
  }
  const point = scalarMultiply(bytesToBigInt(scalar))
  if (point === null) throw new Error('Ungültiger öffentlicher Punkt')
  let x = point[0]
  const y = point[1]
  const out = new Uint8Array(33)
  out[0] = (y & 1n) === 1n ? 0x03 : 0x02
  for (let i = 32; i >= 1; i--) {
    out[i] = Number(x & 0xffn)
    x >>= 8n
  }
  return out
}
