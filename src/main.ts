import './styles.css'
import { CONFIG } from './lib/config'
import {
  fetchDidDocument,
  fetchPlcData,
  resolveIdentity,
  type ResolvedIdentity,
  type PlcOperationData,
} from './lib/did'
import {
  finishLogin,
  readCallback,
  startLogin,
  type TokenSet,
} from './lib/oauth'
import { PdsClient } from './lib/xrpc'
import { applyOverrides } from './lib/config'
import {
  generateRotationKey,
  keyBackupText,
  type RotationKeyPair,
} from './lib/keys'
import {
  applyI18n,
  getLang,
  onLangChange,
  setLang,
  t,
} from './lib/i18n'

/* ------------------------------------------------------------------ */
/* DOM-Helfer                                                          */
/* ------------------------------------------------------------------ */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T

const el = {
  stepHandle: $('step-handle'),
  stepCheck: $('step-check'),
  stepRedirect: $('step-redirect'),
  stepToken: $('step-token'),
  stepDone: $('step-done'),
  stepDidWeb: $('step-didweb'),
  checkHandle: $('check-handle'),
  checkDid: $('check-did'),
  checkPds: $('check-pds'),
  checkKeyCount: $('check-key-count'),
  checkKeyList: $<HTMLOListElement>('check-key-list'),
  checkContinue: $<HTMLButtonElement>('check-continue'),
  checkCancel: $<HTMLButtonElement>('check-cancel'),
  handleForm: $<HTMLFormElement>('handle-form'),
  handleInput: $<HTMLInputElement>('handle-input'),
  handleSubmit: $<HTMLButtonElement>('handle-submit'),
  redirectStatus: $('redirect-status'),
  langButtons: Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-lang]'),
  ),
  testBanner: $('test-mode-banner'),
  errorBox: $('error-box'),
  tokenRequestStatus: $('token-request-status'),
  tokenRequested: $('token-requested'),
  tokenForm: $<HTMLFormElement>('token-form'),
  tokenInput: $<HTMLInputElement>('token-input'),
  tokenSubmit: $<HTMLButtonElement>('token-submit'),
  regenToken: $<HTMLButtonElement>('regen-token'),
  keyPreview: $('key-preview'),
  newDidKey: $('new-didkey'),
  rotationKeyList: $<HTMLOListElement>('rotationkey-list'),
  verifyJson: $('verify-json'),
  downloadKey: $<HTMLButtonElement>('download-key'),
  copyKey: $<HTMLButtonElement>('copy-key'),
  didwebDid: $('didweb-did'),
  didwebDoc: $('didweb-doc'),
  downloadDidwebKey: $<HTMLButtonElement>('download-didweb-key'),
  downloadDidwebDoc: $<HTMLButtonElement>('download-didweb-doc'),
}

function show(...sections: HTMLElement[]): void {
  for (const s of [
    el.stepHandle,
    el.stepCheck,
    el.stepRedirect,
    el.stepToken,
    el.stepDone,
    el.stepDidWeb,
  ]) {
    s.hidden = !sections.includes(s)
  }
}

function showError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  el.errorBox.textContent = message
  el.errorBox.hidden = false
  console.error(err)
}

function clearError(): void {
  el.errorBox.hidden = true
  el.errorBox.textContent = ''
}

function download(filename: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/* ------------------------------------------------------------------ */
/* Sprachumschalter                                                    */
/* ------------------------------------------------------------------ */

function markActiveLang(): void {
  for (const button of el.langButtons) {
    const isActive = button.dataset.lang === getLang()
    button.classList.toggle('active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  }
}

for (const button of el.langButtons) {
  button.addEventListener('click', () => {
    const lang = button.dataset.lang
    if (lang === 'de' || lang === 'en') setLang(lang)
  })
}

onLangChange((lang) => {
  applyI18n()
  document.documentElement.lang = lang
  markActiveLang()
  // sichtbare dynamische Texte nachrendern
  if (!el.testBanner.hidden) showTestBanner()
  if (!el.keyPreview.hidden) renderKeyPreview()
  if (!el.tokenRequestStatus.hidden) {
    el.tokenRequestStatus.querySelector('span:last-child')!.textContent = t(
      'token.requesting',
    )
  }
})

/* ------------------------------------------------------------------ */
/* App-Zustand (nur Speicher – nie persistiert)                         */
/* ------------------------------------------------------------------ */

interface AppState {
  identity: ResolvedIdentity | null
  tokens: TokenSet | null
  rotationKey: RotationKeyPair | null
  plc: PlcOperationData | null
  pds: PdsClient | null
  tokenRequestedAt: string | null
}

const state: AppState = {
  identity: null,
  tokens: null,
  rotationKey: null,
  plc: null,
  pds: null,
  tokenRequestedAt: null,
}

/* ------------------------------------------------------------------ */
/* Schritt 1: Handle                                                   */
/* ------------------------------------------------------------------ */

el.handleForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  clearError()
  const input = el.handleInput.value.trim()
  if (!input) return

  el.handleSubmit.disabled = true
  el.redirectStatus.textContent = t('redirect.resolving')
  show(el.stepRedirect)
  try {
    const identity = await resolveIdentity(input)
    state.identity = identity

    if (identity.didKind === 'web') {
      await startDidWebFlow(identity)
      return
    }

    // Vor dem Login: öffentliche Daten zeigen (DID, PDS, vorhandene Keys),
    // damit man bewusst entscheiden kann, ob ein weiterer Key gewünscht ist.
    const plc = await fetchPlcData(identity.did)
    state.plc = plc
    renderCheck(identity, plc)
    show(el.stepCheck)
  } catch (err) {
    showError(err)
    show(el.stepHandle)
  } finally {
    el.handleSubmit.disabled = false
  }
})

function renderCheck(identity: ResolvedIdentity, plc: PlcOperationData): void {
  el.checkHandle.textContent = identity.handle
  el.checkDid.textContent = identity.did
  el.checkPds.textContent = identity.pdsUrl
  el.checkKeyCount.textContent = `(${plc.rotationKeys.length})`

  el.checkKeyList.replaceChildren()
  for (const value of plc.rotationKeys) {
    const li = document.createElement('li')
    li.className = 'plain'
    const tag = document.createElement('span')
    tag.className = 'tag'
    tag.textContent = value.startsWith('did:key:zDn')
      ? 'P-256'
      : value.startsWith('did:key:zQ3s')
        ? 'secp256k1'
        : '?'
    const text = document.createElement('span')
    text.textContent = value
    li.append(tag, text)
    el.checkKeyList.append(li)
  }
}

el.checkCancel.addEventListener('click', () => {
  clearError()
  show(el.stepHandle)
})

el.checkContinue.addEventListener('click', async () => {
  const identity = state.identity
  if (!identity) return
  clearError()
  el.checkContinue.disabled = true
  el.redirectStatus.textContent = t('redirect.login')
  show(el.stepRedirect)
  try {
    // OAuth-Redirect passiert hier; nach Rückkehr landen wir im Callback-Zweig.
    await startLogin({
      handle: identity.handle,
      did: identity.did,
      pdsUrl: identity.pdsUrl,
    })
  } catch (err) {
    showError(err)
    show(el.stepCheck)
  } finally {
    el.checkContinue.disabled = false
  }
})

/* ------------------------------------------------------------------ */
/* did:web-Fallback                                                    */
/* ------------------------------------------------------------------ */

async function startDidWebFlow(identity: ResolvedIdentity): Promise<void> {
  const rotationKey = await generateRotationKey()
  state.rotationKey = rotationKey

  const doc = await fetchDidDocument(identity.did)
  const proposed = {
    ...doc,
    // Der neue Key wird als zusätzliche VerificationMethod eingetragen;
    // die Hosting-Rotation selbst erfolgt über das gehostete did.json.
    verificationMethod: [
      ...(doc.verificationMethod ?? []).map((vm) => ({
        id: vm.id,
        type: vm.type,
        controller: vm.controller,
        publicKeyMultibase: vm.publicKeyMultibase,
      })),
      {
        id: `${identity.did}#atveto-rotation`,
        type: 'Multikey',
        controller: identity.did,
        publicKeyMultibase: rotationKey.didKey.replace('did:key:', ''),
      },
    ],
  }

  el.didwebDid.textContent = identity.did
  el.didwebDoc.textContent = JSON.stringify(proposed, null, 2)
  el.downloadDidwebKey.onclick = () =>
    download(
      `atveto-recovery-key-${identity.handle || identity.did}.txt`,
      keyBackupText(rotationKey, { did: identity.did, handle: identity.handle }),
      'text/plain',
    )
  el.downloadDidwebDoc.onclick = () =>
    download('did.json', JSON.stringify(proposed, null, 2), 'application/did+json')
  show(el.stepDidWeb)
}

/* ------------------------------------------------------------------ */
/* Callback: Login abschließen                                          */
/* ------------------------------------------------------------------ */

async function handleCallback(): Promise<boolean> {
  const params = new URLSearchParams(location.search)
  const oauthError = params.get('error')
  if (oauthError && !params.get('code')) {
    clearUrl()
    showError(
      `Login abgelehnt (${oauthError}): ${params.get('error_description') ?? 'keine Beschreibung'}`,
    )
    show(el.stepHandle)
    return true
  }

  const callback = readCallback()
  if (!callback) return false

  clearUrl()
  show(el.stepRedirect)
  el.redirectStatus.textContent = t('redirect.finishing')
  try {
    const tokens = await finishLogin(callback)
    // URL-Overrides wieder einsetzen (der Callback hat keine Query-Parameter)
    applyOverrides(tokens.overrides)
    state.tokens = tokens
    state.pds = new PdsClient(tokens)
    // Identität nach dem Reload rekonstruieren: die DID ist per Token
    // verifiziert (sub == session.did), also kann direkt neu aufgelöst werden.
    state.identity = await resolveIdentity(tokens.did)
    await runPostLoginFlow()
    return true
  } catch (err) {
    showError(err)
    show(el.stepHandle)
    return true
  }
}

function clearUrl(): void {
  const url = new URL(location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('iss')
  url.searchParams.delete('error')
  url.searchParams.delete('error_description')
  history.replaceState(null, '', url.toString())
}

/* ------------------------------------------------------------------ */
/* Nach dem Login: Token anfordern + Schlüssel erzeugen                 */
/* ------------------------------------------------------------------ */

async function runPostLoginFlow(): Promise<void> {
  const identity = state.identity!

  show(el.stepToken)
  el.tokenRequestStatus.hidden = false
  el.tokenRequested.hidden = true
  el.keyPreview.hidden = true

  // Reihenfolge gemäß Anforderungen: zuerst das E-Mail-Token anfordern …
  await requestTokenWithUi()
  el.tokenRequestStatus.hidden = true
  el.tokenRequested.hidden = false

  // … danach den neuen Rotation Key erzeugen (nur Speicher).
  state.plc = await fetchPlcData(identity.did)
  state.rotationKey = await generateRotationKey()
  renderKeyPreview()
  el.keyPreview.hidden = false

  el.tokenInput.focus()
}

async function requestTokenWithUi(): Promise<void> {
  el.tokenRequestStatus.querySelector('span:last-child')!.textContent = t(
    'token.requesting',
  )
  await state.pds!.requestEmailToken()
  state.tokenRequestedAt = new Date().toISOString()
}

el.regenToken.addEventListener('click', async () => {
  el.regenToken.disabled = true
  try {
    await requestTokenWithUi()
    el.tokenInput.value = ''
    el.tokenInput.focus()
  } catch (err) {
    showError(err)
  } finally {
    el.regenToken.disabled = false
  }
})

function renderKeyPreview(): void {
  const key = state.rotationKey!
  el.newDidKey.textContent = key.didKey

  el.rotationKeyList.replaceChildren()
  const entries: { value: string; isNew: boolean }[] = [
    { value: key.didKey, isNew: true },
    ...state.plc!.rotationKeys.map((value) => ({ value, isNew: false })),
  ]
  for (const entry of entries) {
    const li = document.createElement('li')
    if (entry.isNew) li.classList.add('new')
    const tag = document.createElement('span')
    tag.className = 'tag'
    tag.textContent = t(entry.isNew ? 'key.new' : 'key.current')
    const text = document.createElement('span')
    text.textContent = entry.value
    li.append(tag, text)
    el.rotationKeyList.append(li)
  }
}

/* ------------------------------------------------------------------ */
/* Schritt 3: Token bestätigen → signPlcOperation → submitPlcOperation  */
/* ------------------------------------------------------------------ */

el.tokenForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  clearError()
  const token = el.tokenInput.value.trim()
  if (!token || !state.pds || !state.rotationKey || !state.plc) return

  el.tokenSubmit.disabled = true
  el.tokenSubmit.textContent = t('token.submitting')
  try {
    const rotationKeys = [
      state.rotationKey.didKey,
      ...state.plc.rotationKeys,
    ]

    // 1. PDS signiert die PLC-Update-Operation (mit seinem eigenen
    //    Rotation Key; das E-Mail-Token autorisiert den Vorgang).
    const signed = (await state.pds.signPlcUpdate(rotationKeys, token)) as {
      operation: unknown
    }
    if (!signed?.operation) {
      throw new Error(
        getLang() === 'de'
          ? 'PDS hat keine signierte Operation zurückgegeben.'
          : 'PDS did not return a signed operation.',
      )
    }

    // 2. Operation beim PLC-Verzeichnis einreichen.
    await state.pds.submitPlcOperation(signed.operation)

    // 3. Verifikation: frisch aus dem PLC-Verzeichnis lesen.
    const updated = await fetchPlcData(state.identity!.did)
    renderDone(updated)
  } catch (err) {
    showError(err)
  } finally {
    el.tokenSubmit.disabled = false
    el.tokenSubmit.textContent = t('token.submit')
  }
})

function renderDone(updated: PlcOperationData): void {
  const first = updated.rotationKeys[0]
  if (first !== state.rotationKey!.didKey) {
    showError(
      getLang() === 'de'
        ? 'Der neue Schlüssel ist nicht an erster Stelle der rotationKeys gelandet – ' +
            `erster Eintrag ist ${first}.`
        : 'The new key did not end up as the first rotation key – ' +
            `first entry is ${first}.`,
    )
    show(el.stepToken)
    return
  }
  el.verifyJson.textContent = JSON.stringify(
    {
      did: state.identity!.did,
      rotationKeys: updated.rotationKeys,
    },
    null,
    2,
  )
  show(el.stepDone)
}

el.downloadKey.addEventListener('click', () => {
  const key = state.rotationKey!
  download(
    `atveto-recovery-key-${state.identity!.did}.txt`,
    keyBackupText(key, {
      did: state.identity!.did,
      handle: state.identity!.handle,
    }),
    'text/plain',
  )
})

el.copyKey.addEventListener('click', async () => {
  const key = state.rotationKey
  const identity = state.identity
  if (!key || !identity) return

  const content = keyBackupText(key, {
    did: identity.did,
    handle: identity.handle,
  })

  const showCopied = (ok: boolean) => {
    el.copyKey.textContent = ok ? t('done.copied') : t('done.copyFailed')
    setTimeout(() => {
      el.copyKey.textContent = t('done.copy')
    }, 2500)
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content)
    } else {
      // Fallback für Umgebungen ohne Clipboard-API
      const textarea = document.createElement('textarea')
      textarea.value = content
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.append(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      textarea.remove()
      if (!ok) throw new Error('copy failed')
    }
    showCopied(true)
  } catch (err) {
    console.error(err)
    showCopied(false)
  }
})

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function showTestBanner(): void {
  if (!CONFIG.pds && !CONFIG.resolver && CONFIG.plc === 'https://plc.directory') {
    return
  }
  el.testBanner.textContent = t('test.banner')
  el.testBanner.hidden = false
}

async function boot(): Promise<void> {
  applyI18n()
  document.documentElement.lang = getLang()
  markActiveLang()
  showTestBanner()
  await handleCallback()
}

void boot()
