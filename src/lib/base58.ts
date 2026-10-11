/**
 * Minimaler Base58btc-Encoder (Bitcoin-Alphabet, mit Prüfsummen-Padding
 * à la multibase). Nur encode wird gebraucht (für did:key).
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''

  // Führende Null-Bytes → führende '1'-Zeichen
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++

  // Big-Integer-Division in Base 58
  const digits: number[] = []
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    let j = 0
    for (let k = digits.length - 1; k >= 0; k--) {
      const v = digits[k] * 256 + carry
      digits[k] = v % 58
      carry = Math.floor(v / 58)
    }
    while (carry > 0) {
      digits.unshift(carry % 58)
      carry = Math.floor(carry / 58)
      j++
    }
  }

  return (
    '1'.repeat(zeros) +
    digits.map((d) => ALPHABET[d]).join('')
  )
}
