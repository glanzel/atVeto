/**
 * Minimales i18n – Deutsch/Englisch, ohne Abhängigkeiten.
 *
 * Die Sprache wird pro Session im Speicher gehalten (nicht persistiert) und
 * folgt standardmäßig der Browser-Sprache. Der Schalter in der Kopfzeile
 * rendered die statischen Texte neu; dynamisch erzeugte Texte (Key-Liste,
 * Statusmeldungen) holen sich ihre Strings zur Erzeugungszeit.
 */

export type Lang = 'de' | 'en'

const STRINGS = {
  de: {
    'title': 'atVeto – dein eigener Recovery Key für dein Bluesky-Konto',
    'tagline':
      'Erzeuge deinen eigenen Recovery Key – damit du den Schlüssel zu deinem Konto in der Hand hältst.',

    'about.summary': 'Was ist ein Recovery Key?',
    'about.p1':
      'Deine ATProto-Identität (did:plc) wird von „Rotation Keys“ kontrolliert. Mit ihnen lassen sich ' +
      'Schlüssel und Dienste deiner Identität ändern – und im Notfall wiederherstellen.',
    'about.li1':
      'Bei bsky.social verwaltet dein PDS diese Schlüssel und nutzt dieselben für alle Accounts. ' +
      'Du selbst hältst keinen.',
    'about.li2':
      'atVeto erzeugt einen eigenen Schlüssel und hinterlegt ihn mit höchster Priorität in deiner DID.',
    'about.li3':
      'Am Ende bekommst du den privaten Schlüssel als Datei – damit kannst du deine Identität auch dann ' +
      'wiederherstellen, wenn dein PDS verschwindet oder gesperrt wird.',
    'about.li4':
      'Dein PDS behält seine Schlüssel: Dein Account funktioniert unverändert weiter.',
    'about.p2':
      'Wichtig: Der Schlüssel ist kein Passwort und kein Login. Bewahre die heruntergeladene Datei sicher auf – ' +
      'wer sie hat, kann deine Identität kontrollieren. atVeto läuft in deinem Browser, speichert nichts und ' +
      'spricht nur mit deinem PDS und den öffentlichen Verzeichnisdiensten.',

    'handle.label': 'Dein Bluesky-Handle',
    'handle.submit': 'Key erstellen',

    'check.title': 'Dein Account',
    'check.did': 'DID',
    'check.pds': 'PDS',
    'check.keys': 'Aktuelle Rotation Keys',
    'check.keysNote':
      'zQ3s…-Keys (secp256k1) sind typischerweise die Schlüssel deines PDS. Ein zDn…-Key ' +
      '(P-256) ist typischerweise ein eigener Recovery-Key – zum Beispiel aus einem Umzug zu ' +
      'Eurosky oder einem anderen Tool.',
    'check.continue': 'Weiter mit Login',
    'check.cancel': 'Abbrechen',
    'check.loginHint':
      'Der Login erfolgt auf der Seite deines PDS – atVeto sieht deine Zugangsdaten nie.',

    'test.banner':
      'Testmodus (nur in der Entwicklung aktiv): Auflösung/PLC zeigen auf eine lokale Instanz. ' +
      'Der Login erscheint nach Klick auf „Weiter“ auf der Seite des PDS – nicht in dieser App.',

    'redirect.resolving': 'Handle wird aufgelöst …',
    'redirect.login': 'Weiterleitung zum Login …',
    'redirect.finishing': 'Login wird abgeschlossen …',

    'token.title': '2. Token & neuer Schlüssel',
    'token.requesting': 'Token wird per E-Mail angefordert …',
    'token.requestedNote':
      'Ein Token wurde an die E-Mail-Adresse deines PDS-Kontos geschickt. Unten eintragen und bestätigen.',
    'token.label': 'Token aus der E-Mail',
    'token.submit': 'Rotation Key hinterlegen',
    'token.submitting': 'Wird hinterlegt …',
    'token.regenPrefix': 'Kein Token angekommen?',
    'token.regen': 'neues Token anfordern',

    'key.newTitle': 'Neuer öffentlicher Schlüssel',
    'key.listTitle': 'Rotation Keys nach dem Update',
    'key.new': 'neu · höchste Priorität',
    'key.current': 'aktuell',
    'key.note':
      'Der Eintrag an erster Stelle hat die höchste Priorität. Der bestehende Schlüssel deines PDS bleibt erhalten – dein Account funktioniert danach unverändert weiter.',

    'done.title': '3. Fertig',
    'done.success': 'Der neue Rotation Key wurde verifiziert als rotationKeys[0] deiner DID.',
    'done.saveTitle': 'Privaten Schlüssel jetzt sichern',
    'done.warning':
      'Diese Datei existiert nur in deinem Browser und wird beim Schließen des Tabs gelöscht. ' +
      'Sie ist dein Recovery-Schlüssel für die DID – sicher aufbewahren, nicht in die Cloud legen.',
    'done.download': 'Privaten Schlüssel herunterladen',
    'done.close': 'Danach kannst du den Tab schließen.',

    'didweb.title': 'DID',
    'didweb.body':
      'Für did:web-Accounts gibt es keinen PDS-Signaturweg (signPlcOperation funktioniert nur für did:plc). ' +
      'Rotation erfolgt, indem du das von dir gehostete did.json bearbeitest.',
    'didweb.note':
      'Hier ist dein neues Schlüsselpaar. Trage den öffentlichen Teil in dein did.json ein und hoste es neu:',
    'didweb.downloadKey': 'Schlüsselpaar herunterladen',
    'didweb.downloadDoc': 'did.json-Vorlage herunterladen',

    'footer.privacy':
      'Läuft komplett in deinem Browser. Kein Backend, keine Analyse, keine Speicherung: der private ' +
      'Schlüssel bleibt im Arbeitsspeicher, bis du ihn herunterlädst. Anfragen gehen ausschließlich an ' +
      'die öffentlichen ATProto-Verzeichnisdienste (Handle/DID-Auflösung) und an dein eigenes PDS – ' +
      'an niemanden sonst. Während des OAuth-Logins liegt übergangsweise eine Session in sessionStorage, ' +
      'die direkt nach dem Token-Tausch wieder gelöscht wird.',
    'footer.source': 'Quellcode',
  },
  en: {
    'title': 'atVeto – your own recovery key for your Bluesky account',
    'tagline':
      'Create your own recovery key – so you hold the key to your account.',

    'about.summary': 'What is a recovery key?',
    'about.p1':
      'Your ATProto identity (did:plc) is controlled by “rotation keys”. They can change the keys and ' +
      'services of your identity – and restore it in an emergency.',
    'about.li1':
      'On bsky.social your PDS manages these keys and uses the same ones for all accounts. ' +
      'You do not hold one yourself.',
    'about.li2':
      'atVeto generates your own key and registers it with the highest priority in your DID.',
    'about.li3':
      'At the end you receive the private key as a file – so you can restore your identity even if your ' +
      'PDS disappears or gets locked.',
    'about.li4':
      'Your PDS keeps its keys: your account keeps working unchanged.',
    'about.p2':
      'Important: this key is not a password and not a login. Store the downloaded file safely – whoever ' +
      'has it can control your identity. atVeto runs in your browser, stores nothing and only talks to ' +
      'your PDS and the public directory services.',

    'handle.label': 'Your Bluesky handle',
    'handle.submit': 'Create key',

    'check.title': 'Your account',
    'check.did': 'DID',
    'check.pds': 'PDS',
    'check.keys': 'Current rotation keys',
    'check.keysNote':
      'zQ3s… keys (secp256k1) are typically your PDS’s keys. A zDn… key (P-256) is typically ' +
      'your own recovery key – e.g. from migrating to Eurosky or another tool.',
    'check.continue': 'Continue with login',
    'check.cancel': 'Cancel',
    'check.loginHint':
      'Login happens on your PDS page – atVeto never sees your credentials.',

    'test.banner':
      'Test mode (development only): resolution/PLC point to a local instance. ' +
      'The login appears after clicking “Continue”, on the PDS page – not in this app.',

    'redirect.resolving': 'Resolving handle …',
    'redirect.login': 'Redirecting to login …',
    'redirect.finishing': 'Completing login …',

    'token.title': '2. Token & new key',
    'token.requesting': 'Requesting token via email …',
    'token.requestedNote':
      'A token has been sent to your PDS account email address. Enter it below to confirm.',
    'token.label': 'Token from the email',
    'token.submit': 'Submit rotation key',
    'token.submitting': 'Submitting …',
    'token.regenPrefix': "Didn't receive a token?",
    'token.regen': 'request a new token',

    'key.newTitle': 'New public key',
    'key.listTitle': 'Rotation keys after the update',
    'key.new': 'new · highest priority',
    'key.current': 'current',
    'key.note':
      'The first entry has the highest priority. Your PDS’s existing key is kept – ' +
      'your account keeps working unchanged afterwards.',

    'done.title': '3. Done',
    'done.success': 'The new rotation key was verified as rotationKeys[0] of your DID.',
    'done.saveTitle': 'Save your private key now',
    'done.warning':
      'This file exists only in your browser and is deleted when you close the tab. ' +
      'It is the recovery key for your DID – store it safely, do not put it in the cloud.',
    'done.download': 'Download private key',
    'done.close': 'You can close this tab afterwards.',

    'didweb.title': 'DID',
    'didweb.body':
      'For did:web accounts there is no PDS signing path (signPlcOperation only works for did:plc). ' +
      'Rotation happens by editing the did.json you host yourself.',
    'didweb.note':
      'Here is your new key pair. Add the public part to your did.json and re-host it:',
    'didweb.downloadKey': 'Download key pair',
    'didweb.downloadDoc': 'Download did.json template',

    'footer.privacy':
      'Runs entirely in your browser. No backend, no analytics, no storage: the private key ' +
      'stays in memory until you download it. Requests go only to the public ATProto directory ' +
      'services (handle/DID resolution) and to your own PDS – nowhere else. During OAuth login ' +
      'a transient session lives in sessionStorage, deleted right after the token exchange.',
    'footer.source': 'Source code',
  },
} as const

export type StringKey = keyof (typeof STRINGS)['de']

let current: Lang = detectLanguage()
const listeners = new Set<(lang: Lang) => void>()

function detectLanguage(): Lang {
  const nav = navigator.language?.toLowerCase() ?? 'de'
  return nav.startsWith('de') ? 'de' : 'en'
}

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  for (const listener of listeners) listener(lang)
}

export function onLangChange(listener: (lang: Lang) => void): void {
  listeners.add(listener)
}

export function t(key: StringKey): string {
  return STRINGS[current][key]
}

/**
 * Wendet data-i18n/data-i18n-ph-Attribute auf den statischen HTML-Gerüst an.
 */
export function applyI18n(root: ParentNode = document): void {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n') as StringKey
    if (key in STRINGS[current]) el.textContent = STRINGS[current][key]
  }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) {
    const key = el.getAttribute('data-i18n-ph') as StringKey
    if (el instanceof HTMLInputElement && key in STRINGS[current]) {
      el.placeholder = STRINGS[current][key]
    }
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    const key = el.getAttribute('data-i18n-title') as StringKey
    if (el instanceof HTMLElement && key in STRINGS[current]) {
      el.title = STRINGS[current][key]
    }
  }
}
