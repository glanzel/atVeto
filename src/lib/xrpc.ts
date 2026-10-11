/**
 * Authentifizierte XRPC-Aufrufe gegen das PDS (Bearer: DPoP-Token +
 * DPoP-Proof-Header). Nur die drei Endpoints, die atVeto braucht:
 *
 *   POST xrpc/com.atproto.identity.requestPlcOperationSignature  (E-Mail-Token anfordern)
 *   POST xrpc/com.atproto.identity.signPlcOperation              (PLC-Op signieren lassen)
 *   POST xrpc/com.atproto.identity.submitPlcOperation            (Op einreichen)
 */

import {
  importEs256Signer,
  sha256B64u,
  randomB64u,
  bytesToB64u,
} from './keys'
import type { TokenSet } from './oauth'

export class PdsClient {
  private signer: CryptoKey | null = null
  private publicJwk: JsonWebKey | null = null
  private nonce: string | undefined

  constructor(private readonly tokens: TokenSet) {}

  private async ensureKeys(): Promise<void> {
    if (this.signer && this.publicJwk) return
    this.signer = await importEs256Signer(this.tokens.dpopJwk)
    // Das private JWK enthält x/y – das reicht für den DPoP-Header.
    this.publicJwk = this.tokens.dpopJwk
  }

  private async proof(htm: string, htu: string): Promise<string> {
    await this.ensureKeys()
    const header = {
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: this.publicJwk!.x,
        y: this.publicJwk!.y,
      },
    }
    const payload = {
      jti: randomB64u(16),
      htm,
      htu,
      iat: Math.floor(Date.now() / 1000),
      ath: await sha256B64u(this.tokens.accessToken),
      ...(this.nonce ? { nonce: this.nonce } : {}),
    }
    const signingInput = `${bytesToB64u(
      new TextEncoder().encode(JSON.stringify(header)),
    )}.${bytesToB64u(new TextEncoder().encode(JSON.stringify(payload)))}`
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.signer!,
      new TextEncoder().encode(signingInput),
    )
    return `${signingInput}.${bytesToB64u(new Uint8Array(sig))}`
  }

  /** Prozedur mit Body (application/json) aufrufen. */
  async procedure(nsid: string, body?: unknown): Promise<unknown> {
    const url = `${this.tokens.pdsUrl}/xrpc/${nsid}`
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `DPoP ${this.tokens.accessToken}`,
          DPoP: await this.proof('POST', url),
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await res.text()
      const nonce = res.headers.get('DPoP-Nonce')
      if (nonce) this.nonce = nonce

      if (!res.ok) {
        // DPoP-Nonce-Fehler kommt je nach Server als 400 oder 401,
        // body.error oder WWW-Authenticate-Header.
        const needsNonce =
          (res.status === 400 || res.status === 401) &&
          (() => {
            try {
              if (JSON.parse(text).error === 'use_dpop_nonce') return true
            } catch {
              // Rohtext / HTML
            }
            return (
              /use_dpop_nonce/i.test(text) ||
              (res.headers.get('WWW-Authenticate')?.includes('use_dpop_nonce') ??
                false)
            )
          })()
        if (needsNonce && nonce && attempt < 2) {
          continue // Retry mit frischem Nonce
        }
        let message = text.slice(0, 400)
        try {
          const json = JSON.parse(text) as { message?: string; error?: string }
          message = json.message ?? json.error ?? message
        } catch {
          /* Rohtext */
        }
        throw new Error(`${nsid} fehlgeschlagen (${res.status}): ${message}`)
      }
      return text ? JSON.parse(text) : {}
    }
    throw new Error(`${nsid}: zu viele Nonce-Retries.`)
  }

  /* -- die drei atVeto-Endpoints -- */

  requestEmailToken(): Promise<unknown> {
    return this.procedure('com.atproto.identity.requestPlcOperationSignature')
  }

  signPlcUpdate(rotationKeys: string[], token: string): Promise<unknown> {
    return this.procedure('com.atproto.identity.signPlcOperation', {
      token,
      rotationKeys,
    })
  }

  submitPlcOperation(operation: unknown): Promise<unknown> {
    return this.procedure('com.atproto.identity.submitPlcOperation', {
      operation,
    })
  }
}
