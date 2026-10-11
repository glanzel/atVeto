import './styles.css'
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
import {
  generateRotationKey,
  keyBackupFile,
  type RotationKeyPair,
} from './lib/keys'

/* ------------------------------------------------------------------ */
/* DOM-Helfer                                                          */
/* ------------------------------------------------------------------ */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T

const el = {
  stepHandle: $('step-handle'),
  stepRedirect: $('step-redirect'),
  stepToken: $('step-token'),
  stepDone: $('step-done'),
  stepDidWeb: $('step-didweb'),
  handleForm: $<HTMLFormElement>('handle-form'),
  handleInput: $<HTMLInputElement>('handle-input'),
  handleSubmit: $<HTMLButtonElement>('handle-submit'),
  redirectStatus: $('redirect-status'),
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
  didwebDid: $('didweb-did'),
  didwebDoc: $('didweb-doc'),
  downloadDidwebKey: $<HTMLButtonElement>('download-didweb-key'),
  downloadDidwebDoc: $<HTMLButtonElement>('download-didweb-doc'),
}

function show(...sections: HTMLElement[]): void {
  for (const s of [
    el.stepHandle,
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
  el.redirectStatus.textContent = 'Handle wird aufgelöst …'
  show(el.stepRedirect)
  try {
    const identity = await resolveIdentity(input)
    state.identity = identity

    if (identity.didKind === 'web') {
      await startDidWebFlow(identity)
      return
    }

    el.redirectStatus.textContent =
      `Weiterleitung zum Login bei ${new URL(identity.pdsUrl).host} …`
    // OAuth-Redirect passiert hier; nach Rückkehr landen wir im Callback-Zweig.
    await startLogin({
      handle: identity.handle,
      did: identity.did,
      pdsUrl: identity.pdsUrl,
    })
  } catch (err) {
    showError(err)
    show(el.stepHandle)
  } finally {
    el.handleSubmit.disabled = false
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
      `atveto-rotation-key-${identity.handle || identity.did}.json`,
      keyBackupFile(rotationKey, { did: identity.did, handle: identity.handle }),
    )
  el.downloadDidwebDoc.onclick = () =>
    download(
      'did.json',
      JSON.stringify(proposed, null, 2),
      'application/did+json',
    )
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
  el.redirectStatus.textContent = 'Login wird abgeschlossen …'
  try {
    const tokens = await finishLogin(callback)
    state.tokens = tokens
    state.pds = new PdsClient(tokens)
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
  el.tokenRequestStatus.querySelector('span:last-child')!.textContent =
    'Token wird per E-Mail angefordert …'
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
    tag.textContent = entry.isNew ? 'neu · höchste Priorität' : 'aktuell'
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
  el.tokenSubmit.textContent = 'Wird hinterlegt …'
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
      throw new Error('PDS hat keine signierte Operation zurückgegeben.')
    }

    // 2. Operation beim PLC-Verzeichnis einreichen.
    await state.pds.submitPlcOperation(signed.operation)

    // 3. Verifikation: frisch aus plc.directory lesen.
    const updated = await fetchPlcData(state.identity!.did)
    renderDone(updated)
  } catch (err) {
    showError(err)
  } finally {
    el.tokenSubmit.disabled = false
    el.tokenSubmit.textContent = 'Rotation Key hinterlegen'
  }
})

function renderDone(updated: PlcOperationData): void {
  const first = updated.rotationKeys[0]
  if (first !== state.rotationKey!.didKey) {
    showError(
      'Der neue Schlüssel ist nicht an erster Stelle der rotationKeys gelandet – ' +
        `erster Eintrag ist ${first}.`,
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
    `atveto-rotation-key-${state.identity!.did}.json`,
    keyBackupFile(key, {
      did: state.identity!.did,
      handle: state.identity!.handle,
    }),
  )
})

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot(): Promise<void> {
  await handleCallback()
}

void boot()
