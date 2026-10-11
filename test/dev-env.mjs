/**
 * Startet eine vollständige, lokale atproto-Testumgebung
 * (@atproto/dev-env): PDS + PLC-Verzeichnis + OAuth-Provider + Seed-Accounts.
 *
 *   npm run test:dev-env
 *
 * Danach atVeto mit den angezeigten URL-Parametern öffnen, z.B.
 *   http://127.0.0.1:5173/?pds=http://127.0.0.1:2582&plc=http://127.0.0.1:2583
 *
 * Login mit alice@test.com / alice-pass. Der Mailversand ist deaktiviert –
 * dieses Skript fängt das PLC-Operation-Token ab und druckt es hier aus.
 *
 * Alles läuft offline; es wird kein echter Account angefasst.
 */

import { TestNetworkNoAppView } from '@atproto/dev-env'
import { createConnection } from 'node:net'

const PDS_PORT = 2582
const PLC_PORT = 2583

/** Prüfen, ob ein Port bereits belegt ist – sonst crasht dev-env mit EADDRINUSE. */
async function assertPortFree(port, name) {
  const inUse = await new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
  if (inUse) {
    console.error(
      `\n  FEHLER: Port ${port} (${name}) ist bereits belegt.\n` +
        '  Vermutlich läuft schon eine dev-env-Instanz (oder vite dev).\n' +
        '  Diese beenden, dann „npm run test:dev-env" erneut ausführen.\n',
    )
    process.exit(1)
  }
}

await assertPortFree(PDS_PORT, 'PDS')
await assertPortFree(PLC_PORT, 'PLC')

const network = await TestNetworkNoAppView.create({
  pds: { port: PDS_PORT },
  plc: { port: PLC_PORT },
})
await network.processAll()

// Seed-Accounts (alice.test / bob.test / carol.test / dan.test) anlegen.
// Ohne Profile/Avatare – das atVeto-Asset fehlt im npm-Package und wird
// für den Rotation-Key-Test nicht gebraucht.
const { SeedClient } = await import('@atproto/dev-env')
const sc = new SeedClient(network, network.pds.getAgent(), network.pds.getClient())
const TEST_USERS = [
  { shortName: 'alice', email: 'alice@test.com', handle: 'alice.test', password: 'alice-pass' },
  { shortName: 'bob', email: 'bob@test.com', handle: 'bob.test', password: 'bob-pass' },
]
for (const user of TEST_USERS) {
  const existing = await network.pds.ctx.accountManager.getAccount(user.handle)
  if (!existing) {
    await sc.createAccount(user.shortName, {
      email: user.email,
      handle: user.handle,
      password: user.password,
    })
  }
}
await network.processAll()

const pdsUrl = `http://127.0.0.1:${PDS_PORT}`
const plcUrl = `http://127.0.0.1:${PLC_PORT}`

// --- Tokens abfangen: Mailversand ist im dev-env deaktiviert ---
const mailer = network.pds.ctx.mailer
const originalSend = mailer.sendPlcOperation.bind(mailer)
mailer.sendPlcOperation = async (params, mailOpts) => {
  console.log('')
  console.log('  ┌───────────────────────────────────────────────┐')
  console.log('  │  PLC-OPERATION-TOKEN (dev-env, „E-Mail“)      │')
  console.log(`  │  ${params.token.padEnd(44, ' ')}│`)
  console.log('  └───────────────────────────────────────────────┘')
  await originalSend(params, mailOpts)
}

// DID + Rotation Keys der Seed-Accounts ausgeben (zur Kontrolle).
console.log('')
console.log('  atVeto-Testumgebung bereit (nur lokal!)')
console.log('  ────────────────────────────────────────────────')
console.log(`  PDS:       ${pdsUrl}`)
console.log(`  PLC:       ${plcUrl}`)
console.log('')
console.log('  App öffnen:')
console.log(
  `  http://127.0.0.1:5173/?resolver=${encodeURIComponent(pdsUrl)}&plc=${encodeURIComponent(plcUrl)}`,
)
console.log('')
console.log(
  '  (Hinweis: kein "pds="-Parameter setzen – die PDS-Adresse kommt aus dem',
)
console.log(
  '   DID-Dokument. Der DPoP-"htu"-Check des Servers prüft gegen dessen eigene',
)
console.log('   publicUrl; ein Host-Override würde den Flow brechen.)')
console.log('')
console.log('  Test-Account:')
console.log('    Handle:  alice.test')
console.log('    E-Mail:  alice@test.com')
console.log('    Passwort: alice-pass')
console.log('')

// Kontinuierlich Rotation Keys eines Accounts anzeigen (Polling).
const alice = await network.pds.ctx.accountManager.getAccount('alice.test')
if (alice) {
  console.log(`  DID von alice.test: ${alice.did}`)
  console.log(`  Rotation Keys:    ${await currentRotationKeys(alice.did)}`)
  console.log('')
  setInterval(async () => {
    const keys = JSON.stringify(await currentRotationKeys(alice.did))
    if (keys !== lastKeys) {
      lastKeys = keys
      console.log('  Rotation Keys aktualisiert:')
      JSON.parse(keys).forEach((k, i) => console.log(`    [${i}] ${k}`))
      console.log('')
    }
  }, 1500)
}
let lastKeys = ''

async function currentRotationKeys(did) {
  try {
    const res = await fetch(`${plcUrl}/${did}/data`)
    const data = await res.json()
    return data.rotationKeys ?? []
  } catch {
    return []
  }
}

// Laufen lassen, bis der Nutzer abbricht (Strg+C).
process.on('SIGINT', async () => {
  console.log('\n  Testumgebung wird beendet …')
  await network.close()
  process.exit(0)
})
