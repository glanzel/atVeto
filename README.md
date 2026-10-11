# atVeto

Kleine, rein client-seitige Web-App: **erzeugt einen zweiten ATProto-Rotation-Key
im Browser** und **hinterlegt ihn mit höchster Priorität** (`rotationKeys[0]`)
über das eigene PDS – per `com.atproto.identity.signPlcOperation`.

Kein Backend. Kein Build-Server zur Laufzeit. **Nichts wird gespeichert**: der
private Schlüssel existiert nur im Arbeitsspeicher des Tabs, bis er als Datei
heruntergeladen wird. Übergangsweise (nur während des OAuth-Logins) liegt eine
Session in `sessionStorage`, die direkt nach dem Token-Tausch gelöscht wird.

## Ablauf

1. **Handle eingeben** (`name.bsky.social`) → Auflösung zu DID + PDS
   (bidirektional verifiziert: DID-Dokument muss `at://<handle>` listen).
2. **Login beim PDS** (atproto-OAuth: PAR + PKCE + DPoP/ES256). Die App sieht
   keine Credentials; nach dem Redirect wird `sub` gegen die erwartete DID
   geprüft.
3. **E-Mail-Token anfordern** (`requestPlcOperationSignature`) – der Server
   schickt ein Token an die E-Mail-Adresse des PDS-Kontos.
4. **Neuen Rotation-Key generieren** (P-256, WebCrypto; did:key mit Multicodec
   `0x1200`).
5. **Token eintragen** → `signPlcOperation` (PDS signiert die Update-Operation)
   → `submitPlcOperation` (PLC-Verzeichnis) → Verifikation aus `plc.directory`.
6. **Privaten Schlüssel herunterladen** – das ist der Recovery-Schlüssel für
   die DID. Danach Tab schließen.

Der bestehende PDS-Schlüssel bleibt in `rotationKeys` erhalten, der neue Schlüssel
wird an **erster** Stelle (= höchste Priorität) eingefügt. Accounts, deren PDS
später verschwindet, können ihre DID damit selbst wiederherstellen.

`did:web`-Accounts werden erkannt: Dort gibt es keinen PDS-Signaturweg, die App
liefert stattdessen ein vorbereitetes `did.json` zum Download.

## Entwicklung

```bash
npm install
npm run dev        # http://127.0.0.1:5173 (muss 127.0.0.1 sein, s.u.)
```

Der Dev-Server läuft bewusst auf **127.0.0.1**: atproto-OAuth erlaubt im
Entwicklungsmodus nur Redirect-URIs auf `http://127.0.0.1/` bzw.
`http://[::1]/` – `localhost` wird von den Authorization-Servern abgelehnt.
Für die lokale Entwicklung baut die App automatisch eine `client_id` im
„localhost exception“-Format (`http://localhost/?redirect_uri=…&scope=…`).

> bsky.app-Accounts: Der OAuth-Login im dev-Modus funktioniert nur, wenn der
> Authorization Server die localhost-Exception unterstützt (bsky.social tut
> das). Echte Logins gegen bsky.social im dev-Modus sind grundsätzlich
> möglich, solange der AS die client_id akzeptiert.

## Deployment (statisches Hosting)

```bash
CLIENT_ORIGIN=https://atveto.example.com npm run build
```

Das Build-Skript schreibt `dist/client-metadata.json` mit passender
`client_id` und `redirect_uri`. `dist/` auf jeden statischen Host legen
(GitHub Pages, Netlify, eigener Webspace). Wichtig:

- HTTPS erforderlich (OAuth)
- `redirect_uri` ist `${CLIENT_ORIGIN}/` (Pfad `/` reicht aus)
- Der AS lädt die Client-Metadaten beim Login von dort

## Technische Details

| Baustein | Datei |
|---|---|
| did:key-Encoding (P-256, Multibase z/base58btc) | `src/lib/base58.ts`, `src/lib/keys.ts` |
| Handle→DID→PDS, PLC-Daten lesen | `src/lib/did.ts` |
| OAuth-Client (PAR/PKCE/DPoP, Token-Tausch) | `src/lib/oauth.ts` |
| XRPC-Calls mit DPoP + Nonce-Retry | `src/lib/xrpc.ts` |
| UI-Flow | `src/main.ts` |

Requested Scope: `atproto identity:*` – `identity:*` ist zwingend, da
`signPlcOperation`/`requestPlcOperationSignature` auf dem PDS die
Identity-Permission `*` verlangen (transitionale Scopes genügen nicht).

## Getestet (read-only / Dry-Run)

 Gegen die echten Endpoints wurde ausschließlich **lesend** getestet:

- `com.atproto.identity.resolveHandle` (public.api.bsky.app)
- DID-Dokumente + `plc.directory/<did>/data` (rotationKeys)
- OAuth-Discovery (`/.well-known/oauth-protected-resource`,
  `/.well-known/oauth-authorization-server`)
- PAR gegen `https://bsky.social/oauth/par` inkl. DPoP-Nonce-Handling
  (201 + `request_uri`; ohne Nutzer-Interaktion, ohne Account-Zugriff)

Nicht automatisiert testbar: der vollständige Login-Durchlauf inkl.
`signPlcOperation`/`submitPlcOperation` – dafür ist ein echter Account und
ein interaktiver Browser-Login nötig.

## Lizenz

MIT (siehe `LICENSE`)
