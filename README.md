# atVeto

**Zweisprachig / Bilingual:** [Deutsch](#deutsch) · [English](#english)

Erzeugt einen zweiten ATProto-Rotation-Key im Browser und hinterlegt ihn mit
höchster Priorität (`rotationKeys[0]`) über das eigene PDS. Läuft komplett
client-seitig – kein Backend, keine Speicherung.

Generates a second ATProto rotation key in the browser and registers it with
highest priority (`rotationKeys[0]`) through your PDS. Fully client-side – no
backend, no storage.

---

<a id="deutsch"></a>

## Deutsch

### Ablauf

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

Der bestehende PDS-Schlüssel bleibt in `rotationKeys` erhalten, der neue
Schlüssel wird an **erster** Stelle (= höchste Priorität) eingefügt. Accounts,
deren PDS später verschwindet, können ihre DID damit selbst wiederherstellen.

`did:web`-Accounts werden erkannt: Dort gibt es keinen PDS-Signaturweg, die App
liefert stattdessen ein vorbereitetes `did.json` zum Download.

### Privatsphäre

Läuft komplett im Browser. Kein Backend, keine Analyse, **keine Speicherung**:
der private Schlüssel bleibt im Arbeitsspeicher, bis er als Datei
heruntergeladen wird. Anfragen gehen ausschließlich an

- die öffentlichen ATProto-Verzeichnisdienste (`public.api.bsky.app` zur
  Handle-Auflösung, `plc.directory` für DID-Dokument und Rotation Keys), und
- an **dein eigenes PDS** (OAuth-Login + die drei XRPC-Aufrufe)

– an niemanden sonsten. Während des OAuth-Logins liegt übergangsweise eine
Session in `sessionStorage` (inkl. DPoP-Key), die direkt nach dem Token-Tausch
wieder gelöscht wird.

### Entwicklung

```bash
npm install
npm run dev        # http://127.0.0.1:5173 (muss 127.0.0.1 sein, s.u.)
```

Der Dev-Server läuft bewusst auf **127.0.0.1**: atproto-OAuth erlaubt im
Entwicklungsmodus nur Redirect-URIs auf `http://127.0.0.1/` bzw.
`http://[::1]/` – `localhost` wird von den Authorization-Servern abgelehnt.

### Gegen eine lokale Testinstanz testen (empfohlen)

Es gibt eine offizielle, vollständig Offline-Testumgebung:
[`@atproto/dev-env`](https://www.npmjs.com/package/@atproto/dev-env) bringt
eigene PDS + PLC-Verzeichnis + OAuth-Provider mit. **Kein echter Account wird
angefasst.**

```bash
npm run test:dev-env        # startet PDS :2582 + PLC :2583, seedet Accounts
npm run dev                 # zweites Terminal: App auf :5173
```

Danach die vom Skript ausgegebene URL öffnen:

```
http://127.0.0.1:5173/?resolver=http://127.0.0.1:2582&plc=http://127.0.0.1:2583
```

Login: `alice@test.com` / `alice-pass` (Handle `alice.test`). Der Mailversand
ist in der Testumgebung deaktiviert – das Skript fängt das PLC-Operation-Token
ab und druckt es in das Terminal, in dem `npm run test:dev-env` läuft. Danach
normal weiter: Token eintragen → `signPlcOperation` → `submitPlcOperation` →
Verifikationsseite + Download.

Hinweise:

- **Node ≥ 22** nötig (`@atproto/dev-env` hängt an aktuellen Node-APIs; unter
  Node 20 crasht `undici`, und `better-sqlite3` muss für Node 22 neu gebaut
  werden: `npm rebuild better-sqlite3`)
- Keinen `pds=`-Parameter setzen: der PDS prüft den DPoP-`htu` gegen seine
  eigene `publicUrl`; ein Host-Override (127.0.0.1 statt localhost) bricht den
  Flow mit `DPoP "htu" mismatch`
- Die URL-Parameter (`pds`, `plc`, `resolver`) funktionieren **nur im
  Dev-Modus**. Im Produktions-Build werden sie ignoriert – die veröffentlichte
  App folgt ausschließlich dem Account (PDS-Adresse aus dem DID-Dokument) und
  lässt sich nicht per URL verbiegen

### Deployment (statisches Hosting)

```bash
CLIENT_ORIGIN=https://atveto.example.com npm run build
```

Das Build-Skript schreibt `dist/client-metadata.json` mit passender
`client_id` und `redirect_uri`. `dist/` auf einen statischen Host legen
(GitHub Pages, Netlify, Cloudflare Pages, eigener Webspace). Wichtig:

- HTTPS erforderlich (OAuth)
- die App muss an der **Wurzel** der Domain liegen – `redirect_uri` ist
  `${CLIENT_ORIGIN}/`, ein Unterpfad würde brechen. Am einfachsten: eigene
  (Sub-)Domain
- der Authorization Server lädt die Client-Metadaten beim Login von
  `${CLIENT_ORIGIN}/client-metadata.json` – die Datei muss öffentlich erreichbar
  sein

### Hinweis für die Veröffentlichung

Der Scope `identity:*` ist nötig, damit `signPlcOperation` funktioniert – auf
der Login-Seite sehen Nutzer deshalb den Warnhinweis *„full control over your
network identity … could permanently break or steal your account"*. Das ist
unvermeidbar für diese Funktion (nur der PDS kann die Operation signieren),
sollte aber auf der Landingpage erklärt werden.

### Getestet

Gegen die echten Endpoints **lesend** getestet: `resolveHandle`,
DID-Dokumente + `plc.directory/<did>/data`, OAuth-Discovery, PAR gegen
`https://bsky.social/oauth/par` inkl. DPoP-Nonce-Handling (201 +
`request_uri`; ohne Nutzer-Interaktion), Browser-Durchlauf gegen bsky.social
bis zur Login-Seite.

**Vollständiger E2E-Durchlauf** (Login → Token → Keygen → Signatur → Submit)
wurde gegen eine **lokale dev-env-Instanz** gefahren – der neue Rotation Key
wurde dort verifiziert als `rotationKeys[0]` hinterlegt, der Download des
privaten Schlüssels ebenfalls geprüft.

### Lizenz

GPL-3.0 (siehe `LICENSE`) – der Code ist öffentlich einsehbar, was bei einer
Client-seitigen Anwendung ohnehin der Fall ist.

---

<a id="english"></a>

## English

### Flow

1. **Enter your handle** (`name.bsky.social`) → resolved to DID + PDS
   (bidirectionally verified: the DID document must list `at://<handle>`).
2. **Login with your PDS** (atproto OAuth: PAR + PKCE + DPoP/ES256). The app
   never sees your credentials; after the redirect, `sub` is checked against
   the expected DID.
3. **Request the email token** (`requestPlcOperationSignature`) – the server
   mails a token to your PDS account email address.
4. **Generate a new rotation key** (P-256, WebCrypto; did:key with multicodec
   `0x1200`).
5. **Enter the token** → `signPlcOperation` (the PDS signs the update
   operation) → `submitPlcOperation` (PLC directory) → verification from
   `plc.directory`.
6. **Download the private key** – it is the recovery key for your DID. Then
   close the tab.

Your PDS's existing key stays in `rotationKeys`; the new key is inserted
**first** (= highest priority). If your PDS ever disappears, you can recover
your DID with it.

`did:web` accounts are detected: there is no PDS signing path for them, so the
app provides a prepared `did.json` download instead.

### Privacy

Runs entirely in your browser. No backend, no analytics, **no storage**: the
private key stays in memory until you download it. Requests go only to

- the public ATProto directory services (`public.api.bsky.app` for handle
  resolution, `plc.directory` for the DID document and rotation keys), and
- **your own PDS** (OAuth login + the three XRPC calls)

– nowhere else. During OAuth login a transient session lives in
`sessionStorage` (including the DPoP key), deleted right after the token
exchange.

### Development

```bash
npm install
npm run dev        # http://127.0.0.1:5173 (must be 127.0.0.1, see below)
```

The dev server deliberately runs on **127.0.0.1**: atproto OAuth only allows
redirect URIs on `http://127.0.0.1/` or `http://[::1]/` in development –
authorization servers reject `localhost`.

### Testing against a local instance (recommended)

There is an official, fully offline test environment:
[`@atproto/dev-env`](https://www.npmjs.com/package/@atproto/dev-env) brings
its own PDS + PLC directory + OAuth provider. **No real account is touched.**

```bash
npm run test:dev-env        # starts PDS :2582 + PLC :2583, seeds accounts
npm run dev                 # second terminal: app on :5173
```

Then open the URL printed by the script:

```
http://127.0.0.1:5173/?resolver=http://127.0.0.1:2582&plc=http://127.0.0.1:2583
```

Login: `alice@test.com` / `alice-pass` (handle `alice.test`). Mail delivery is
disabled in the test environment – the script catches the PLC operation token
and prints it to the terminal where `npm run test:dev-env` runs. Then continue
as usual: enter token → `signPlcOperation` → `submitPlcOperation` →
verification page + download.

Notes:

- **Node ≥ 22 required** (`@atproto/dev-env` depends on current Node APIs; on
  Node 20 `undici` crashes, and `better-sqlite3` needs a rebuild for Node 22:
  `npm rebuild better-sqlite3`)
- Do not set the `pds=` parameter: the PDS validates the DPoP `htu` against
  its own `publicUrl`; a host override (127.0.0.1 instead of localhost) breaks
  the flow with `DPoP "htu" mismatch`
- The URL parameters (`pds`, `plc`, `resolver`) only work **in dev mode**.
  Production builds ignore them – the published app only follows the account
  (PDS address from the DID document) and cannot be pointed elsewhere via URL

### Deployment (static hosting)

```bash
CLIENT_ORIGIN=https://atveto.example.com npm run build
```

The build script writes `dist/client-metadata.json` with a matching
`client_id` and `redirect_uri`. Deploy `dist/` to any static host (GitHub
Pages, Netlify, Cloudflare Pages, webspace). Requirements:

- HTTPS is mandatory (OAuth)
- the app must sit at the **root** of the domain – `redirect_uri` is
  `${CLIENT_ORIGIN}/`, a subpath would break. Easiest: its own (sub)domain
- the authorization server fetches the client metadata from
  `${CLIENT_ORIGIN}/client-metadata.json` at login – the file must be publicly
  reachable

### Note for publishing

The scope `identity:*` is required for `signPlcOperation` to work – users will
therefore see the warning *„full control over your network identity … could
permanently break or steal your account"* on the login page. This is inherent
to what the tool does (only the PDS can sign the operation), but it should be
explained on the landing page.

### Verified

Against the real endpoints, **read-only**: `resolveHandle`, DID documents +
`plc.directory/<did>/data`, OAuth discovery, PAR against
`https://bsky.social/oauth/par` including DPoP nonce handling (201 +
`request_uri`; without user interaction), browser flow against bsky.social up
to the login page.

**Full E2E run** (login → token → keygen → sign → submit) was done against a
**local dev-env instance** – the new rotation key was verified there as
`rotationKeys[0]`, and the private key download was checked as well.

### License

GPL-3.0 (see `LICENSE`) – the code is publicly readable, which is the case for
any client-side application anyway.
