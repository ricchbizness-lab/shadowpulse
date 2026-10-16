/**
 * DNS over HTTPS lookup.
 * Primary  : Cloudflare  https://cloudflare-dns.com/dns-query
 * Fallback : Google      https://dns.google/resolve
 *
 * Both endpoints support CORS for browser use (no pre-flight issues for GET
 * with Accept: application/dns-json).
 *
 * Note to users: domain names entered here are sent to Cloudflare's DNS
 * resolver (and Google's as fallback). See privacy policy for details.
 */

const CF_URL  = 'https://cloudflare-dns.com/dns-query'
const GG_URL  = 'https://dns.google/resolve'
const TIMEOUT = 8000

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return res
  } catch (err) {
    clearTimeout(id)
    throw err
  }
}

async function dohQuery(name, type) {
  const headers = { Accept: 'application/dns-json' }
  const cfUrl   = `${CF_URL}?name=${encodeURIComponent(name)}&type=${type}`
  const ggUrl   = `${GG_URL}?name=${encodeURIComponent(name)}&type=${type}`

  let res
  try {
    res = await fetchWithTimeout(cfUrl, { headers })
    if (!res.ok) throw new Error(`CF HTTP ${res.status}`)
  } catch {
    // fallback to Google
    try {
      res = await fetchWithTimeout(ggUrl, { headers })
      if (!res.ok) throw new Error(`GG HTTP ${res.status}`)
    } catch (err) {
      return { Status: 2, Answer: [], error: err.message } // SERVFAIL-like
    }
  }

  try {
    return await res.json()
  } catch {
    return { Status: 2, Answer: [], error: 'invalid JSON' }
  }
}

/**
 * Returns { records: string[], nxdomain: bool, error: string|null, timedOut: bool }
 */
export async function lookupTXT(name) {
  const data = await dohQuery(name, 'TXT')
  if (data.error?.includes('abort') || data.error?.includes('timeout')) {
    return { records: [], nxdomain: false, error: null, timedOut: true }
  }
  if (data.Status === 3) { // NXDOMAIN
    return { records: [], nxdomain: true, error: null, timedOut: false }
  }
  if (data.Status !== 0) {
    return { records: [], nxdomain: false, error: `DNS error ${data.Status}`, timedOut: false }
  }
  const records = (data.Answer || [])
    .filter(a => a.type === 16) // TXT
    .map(a => a.data.replace(/^"|"$/g, '').replace(/" "/g, '')) // strip quotes & join chunks
  return { records, nxdomain: false, error: null, timedOut: false }
}

export async function lookupSOA(name) {
  const data = await dohQuery(name, 'SOA')
  if (data.Status === 3) return { exists: false }
  return { exists: true } // treat all other statuses (including errors) as "exists"
}

export async function lookupMX(name) {
  const data = await dohQuery(name, 'MX')
  if (data.Status === 3) return { records: [], nxdomain: true, error: null, timedOut: false }
  if (data.Status !== 0) return { records: [], nxdomain: false, error: `DNS error ${data.Status}`, timedOut: false }
  const records = (data.Answer || []).filter(a => a.type === 15).map(a => a.data)
  return { records, nxdomain: false, error: null, timedOut: false }
}
