import './styles.css'
import { applyI18n, getLang, onLangChange, setLang, t } from './lib/i18n'
import { didKeyFromScalar, parseKeyInput, publicKeyMatches } from './lib/keycheck'
import { fetchPlcData, resolveIdentity } from './lib/did'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T

const el = {
  form: $<HTMLFormElement>('verify-form'),
  keyInput: $<HTMLTextAreaElement>('key-input'),
  didInput: $<HTMLInputElement>('did-input'),
  submit: $<HTMLButtonElement>('verify-submit'),
  result: $('verify-result'),
  resultList: $<HTMLDListElement>('result-list'),
  warnings: $('result-warnings'),
  errorBox: $('error-box'),
  langButtons: Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-lang]'),
  ),
}

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
  // Ergebnisse neu beschriften, falls vorhanden
  if (!el.result.hidden && lastRender) lastRender()
})

function clearError(): void {
  el.errorBox.hidden = true
  el.errorBox.textContent = ''
}

function showError(message: string): void {
  el.errorBox.textContent = message
  el.errorBox.hidden = false
}

function addRow(label: string, value: string): void {
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.className = 'mono'
  dd.textContent = value
  el.resultList.append(dt, dd)
}

let lastRender: (() => void) | null = null

el.form.addEventListener('submit', async (event) => {
  event.preventDefault()
  clearError()
  el.result.hidden = true
  lastRender = null

  el.submit.disabled = true
  try {
    const parsed = parseKeyInput(el.keyInput.value)
    const derivedDidKey = didKeyFromScalar(parsed.scalar)
    const storedPublic = parsed.meta.publicDidKey
    const publicMatch = publicKeyMatches(derivedDidKey, storedPublic)

    // Optionaler Abgleich mit der DID (rein lesend, öffentliche Daten)
    const accountInput = el.didInput.value.trim() || parsed.meta.did || parsed.meta.handle
    let account:
      | {
          did: string
          handle: string
          pdsUrl: string
          rotationKeys: string[]
          position: number
        }
      | null = null
    let accountError: string | null = null

    if (accountInput) {
      try {
        const identity = await resolveIdentity(accountInput)
        const plc = await fetchPlcData(identity.did)
        account = {
          did: identity.did,
          handle: identity.handle,
          pdsUrl: identity.pdsUrl,
          rotationKeys: plc.rotationKeys,
          position: plc.rotationKeys.indexOf(derivedDidKey),
        }
      } catch (err) {
        accountError = err instanceof Error ? err.message : String(err)
      }
    }

    const render = () => {
      el.resultList.replaceChildren()
      addRow(t('verify.format'), parsed.format === 'backup' ? t('verify.formatBackup') : t('verify.formatMultibase'))
      addRow(t('verify.derived'), derivedDidKey)

      if (publicMatch !== null) {
        addRow(
          t('verify.publicMatch'),
          publicMatch ? t('verify.yes') : t('verify.mismatch'),
        )
      }
      if (parsed.meta.did) addRow(t('verify.fileDid'), parsed.meta.did)
      if (parsed.meta.handle) addRow(t('verify.fileHandle'), parsed.meta.handle)
      if (parsed.meta.createdAt) addRow(t('verify.created'), parsed.meta.createdAt)

      if (account) {
        addRow(t('verify.account'), `${account.handle} (${account.did})`)
        addRow(t('verify.pds'), account.pdsUrl)
        addRow(
          t('verify.position'),
          account.position >= 0
            ? t('verify.positionFound').replace('{n}', String(account.position))
            : t('verify.positionMissing'),
        )
        addRow(t('verify.keyCount'), String(account.rotationKeys.length))
      }

      el.warnings.replaceChildren()
      if (account && account.position < 0) {
        const p = document.createElement('p')
        p.className = 'warning'
        p.textContent = t('verify.warnNotInDid')
        el.warnings.append(p)
      }
      if (publicMatch === false) {
        const p = document.createElement('p')
        p.className = 'error'
        p.style.marginTop = '1rem'
        p.textContent = t('verify.warnPublicMismatch')
        el.warnings.append(p)
      }
      if (accountError) {
        const p = document.createElement('p')
        p.className = 'note'
        p.textContent = `${t('verify.accountError')}: ${accountError}`
        el.warnings.append(p)
      }
      el.result.hidden = false
    }

    lastRender = render
    render()
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err))
  } finally {
    el.submit.disabled = false
  }
})

function boot(): void {
  applyI18n()
  document.documentElement.lang = getLang()
  markActiveLang()

  // Von der Account-Prüfung übergebene DID/Handle vorbelegen
  const params = new URLSearchParams(location.search)
  const did = params.get('did') ?? params.get('handle')
  if (did && !el.didInput.value) el.didInput.value = did
  el.keyInput.focus()
}

boot()
