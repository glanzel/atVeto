/**
 * Erzeugt nach `vite build` die Datei `dist/client-metadata.json`.
 *
 * Der Authorization Server lädt dieses Dokument beim Login vom client_id-URL
 * herunter – es muss unter genau dieser Adresse erreichbar sein:
 *
 *   CLIENT_ORIGIN=https://atveto.example.com npm run build
 *
 * `client_id` und `redirect_uris` werden aus CLIENT_ORIGIN abgeleitet,
 * der Scope enthält `identity:*` (wird für com.atproto.identity.signPlcOperation
 * benötigt – ohne diesen Scope lehnt der AS die Anfrage ab).
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const outFile = join(distDir, 'client-metadata.json')

const origin = process.env.CLIENT_ORIGIN?.trim().replace(/\/+$/, '')

if (!origin) {
  console.warn(
    '[atveto] CLIENT_ORIGIN nicht gesetzt – client-metadata.json wurde nicht ' +
      'geschrieben. Release-Builds benötigen CLIENT_ORIGIN=https://deine-domain.example',
  )
  process.exit(0)
}

if (!/^https:\/\/[^/]+$/.test(origin)) {
  console.error(
    `[atveto] CLIENT_ORIGIN muss eine https-Origin ohne Pfad sein (z.B. https://atveto.example.com), erhalten: ${origin}`,
  )
  process.exit(1)
}

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
}

const metadata = {
  client_id: `${origin}/client-metadata.json`,
  client_name: 'atVeto – ATProto Rotation Key',
  client_uri: origin,
  application_type: 'web',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  redirect_uris: [`${origin}/`],
  scope: 'atproto identity:*',
  token_endpoint_auth_method: 'none',
  dpop_bound_access_tokens: true,
}

writeFileSync(outFile, `${JSON.stringify(metadata, null, 2)}\n`)
console.log(`[atveto] client-metadata.json geschrieben: ${outFile}`)
console.log(`         client_id: ${metadata.client_id}`)
console.log(`         redirect_uri: ${metadata.redirect_uris[0]}`)
