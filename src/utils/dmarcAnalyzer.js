/**
 * Pure analysis functions — no I/O.
 * All exported functions are synchronous and easily unit-testable.
 */

/* ─── Domain normalizer ─── */
export function normalizeDomain(input) {
  let s = input.trim().toLowerCase()
  if (s.includes('@')) s = s.split('@').pop()
  s = s.replace(/^https?:\/\//i, '')
  s = s.replace(/^www\./i, '')
  s = s.split('/')[0].split('?')[0].split('#')[0]
  return s
}

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/
const IPV4_RE   = /^\d{1,3}(\.\d{1,3}){3}$/

export function validateDomain(domain) {
  if (!domain) return { valid: false, reason: 'Domaine vide.' }
  if (IPV4_RE.test(domain)) return { valid: false, reason: 'Les adresses IP ne sont pas acceptées.' }
  if (!DOMAIN_RE.test(domain)) return { valid: false, reason: 'Format de domaine invalide.' }
  return { valid: true, reason: null }
}

/* ─── DMARC analysis ─── */
export function analyzeDMARC({ records, nxdomain, error, timedOut }) {
  if (timedOut) return { verdict: 'timeout', issues: [], raw: null }
  if (error)    return { verdict: 'error',   issues: [error], raw: null }

  const dmarcRecords = records.filter(r => r.startsWith('v=DMARC1'))

  if (nxdomain || dmarcRecords.length === 0) {
    return {
      verdict: 'absent',
      issues: ["Aucun enregistrement DMARC trouvé. N'importe qui peut usurper votre domaine par email."],
      raw: null,
      policy: null,
      pct: null,
      rua: null,
      sp: null,
    }
  }

  if (dmarcRecords.length > 1) {
    return {
      verdict: 'invalid',
      issues: ["Plusieurs enregistrements DMARC détectés — la RFC 7489 n'en autorise qu'un seul. Le comportement des récepteurs est indéfini."],
      raw: dmarcRecords,
      policy: null,
      pct: null,
      rua: null,
      sp: null,
    }
  }

  const raw    = dmarcRecords[0]
  const tags   = parseTags(raw)
  const policy = tags.p || null
  const pct    = tags.pct !== undefined ? parseInt(tags.pct, 10) : 100
  const rua    = tags.rua || null
  const sp     = tags.sp  || null
  const issues = []

  if (policy === 'none') {
    issues.push("p=none : surveillance uniquement, aucun email n'est bloqué ni mis en quarantaine.")
    if (!rua) issues.push("Aucun rua défini : vous ne recevrez pas les rapports d'agrégats DMARC.")
  } else if (policy === 'quarantine') {
    if (pct < 100) issues.push(`pct=${pct} : seulement ${pct} % des emails sont soumis à la politique.`)
    if (!rua) issues.push('Aucun rua défini : vous ne recevrez pas les rapports DMARC.')
  } else if (policy === 'reject') {
    if (pct < 100) issues.push(`pct=${pct} : seulement ${pct} % des emails sont rejetés.`)
  } else {
    issues.push(`Valeur de politique inconnue : p=${policy}`)
  }

  const verdict = policy === 'reject'      ? 'protégé'
                : policy === 'quarantine'  ? 'surveillance'
                : policy === 'none'        ? 'surveillance'
                : 'invalid'

  return { verdict, issues, raw, policy, pct, rua, sp }
}

/* ─── SPF analysis ─── */
export function analyzeSPF({ records, nxdomain, error, timedOut }) {
  if (timedOut) return { verdict: 'timeout', issues: [], raw: null }
  if (error)    return { verdict: 'error',   issues: [error], raw: null }

  const spfRecords = records.filter(r => r.startsWith('v=spf1'))

  if (nxdomain || spfRecords.length === 0) {
    return { verdict: 'absent', issues: ['Aucun enregistrement SPF trouvé.'], raw: null, qualifier: null, includeCount: 0 }
  }

  if (spfRecords.length > 1) {
    return {
      verdict: 'invalid',
      issues: ["Plusieurs enregistrements SPF détectés — seul le premier sera utilisé et les autres seront ignorés, ce qui peut causer des échecs d'authentification."],
      raw: spfRecords,
      qualifier: null,
      includeCount: 0,
    }
  }

  const raw     = spfRecords[0]
  const issues  = []

  const allMatch = raw.match(/([~?+\-])all\b/)
  const qualifier = allMatch ? allMatch[1] : null

  if (!qualifier) {
    issues.push('Aucun mécanisme "all" trouvé. L\'enregistrement est incomplet.')
  } else if (qualifier === '+') {
    issues.push('+all : tous les serveurs sont autorisés à envoyer — SPF inefficace.')
  } else if (qualifier === '?') {
    issues.push("?all : résultat neutre — n'offre aucune protection.")
  } else if (qualifier === '~') {
    issues.push('~all (softfail) : les emails non autorisés sont acceptés mais marqués.')
  }

  const includes     = (raw.match(/\binclude:/g) || []).length
  const aCount       = (raw.match(/\ba:/g) || []).length
  const mxCount      = (raw.match(/\bmx\b/g) || []).length
  const totalLookups = includes + aCount + mxCount

  if (totalLookups > 10) {
    issues.push(`${totalLookups} requêtes DNS estimées (dont ${includes} include:) — dépasse la limite de 10, les validations SPF échoueront (PermError).`)
  } else if (totalLookups > 7) {
    issues.push(`${totalLookups} requêtes DNS estimées — approche la limite de 10. Vérifiez avant d'ajouter de nouveaux include:.`)
  }

  const verdict = qualifier === '-' && issues.length === 0 ? 'protégé'
                : qualifier === '-'                        ? 'surveillance'
                : qualifier === '~'                        ? 'surveillance'
                : 'absent'

  return { verdict, issues, raw, qualifier, includeCount: includes }
}

/* ─── MX analysis ─── */
export function analyzeMX({ records, nxdomain, error, timedOut }) {
  if (timedOut)  return { verdict: 'timeout', present: false }
  if (error)     return { verdict: 'error',   present: false }
  if (nxdomain || records.length === 0) return { verdict: 'absent', present: false }
  return { verdict: 'présent', present: true, count: records.length }
}

/* ─── helpers ─── */
function parseTags(record) {
  const tags = {}
  record.split(';').forEach(part => {
    const [k, ...rest] = part.trim().split('=')
    if (k && rest.length) tags[k.trim()] = rest.join('=').trim()
  })
  return tags
}
