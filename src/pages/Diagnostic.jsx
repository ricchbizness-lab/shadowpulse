import React, { useState, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar.jsx'
import Footer from '../components/Footer.jsx'
import { normalizeDomain, validateDomain, analyzeDMARC, analyzeSPF, analyzeMX } from '../utils/dmarcAnalyzer.js'
import { lookupTXT, lookupMX, lookupSOA } from '../utils/dnsLookup.js'

const BASE = import.meta.env.BASE_URL
const CALENDLY = 'https://calendly.com/ricch-bizness/new-meeting'

/* ─── Rate limiter: max 5 analyses / 60s ─── */
const timestamps = []
function isRateLimited() {
  const now = Date.now()
  while (timestamps.length && now - timestamps[0] > 60_000) timestamps.shift()
  if (timestamps.length >= 5) return true
  timestamps.push(now)
  return false
}

/* ─── Status badge ─── */
const BADGE = {
  protégé:              { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  quarantaine:          { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  'quarantaine partielle': { bg: 'bg-amber-500/15', text: 'text-amber-400',  border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  surveillance:         { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  strict:               { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  acceptable:           { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  faible:               { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30',  dot: 'bg-orange-400' },
  dangereux:            { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-400' },
  absent:               { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-400' },
  invalid:              { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-400' },
  présent:              { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  timeout:              { bg: 'bg-slate-500/15',   text: 'text-slate-400',   border: 'border-slate-500/30',   dot: 'bg-slate-400' },
  error:                { bg: 'bg-slate-500/15',   text: 'text-slate-400',   border: 'border-slate-500/30',   dot: 'bg-slate-400' },
}

function Badge({ verdict, label }) {
  const s = BADGE[verdict] || BADGE.error
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {label || verdict}
    </span>
  )
}

/* ─── Single result row ─── */
function Row({ label, badge, issues, raw }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[#1E3A5F]/40 last:border-0">
      <div className="flex items-start justify-between gap-4 py-4 px-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-[#F8FAFC]">{label}</span>
            <Badge verdict={badge.verdict} label={badge.label} />
          </div>
          {issues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {issues.map((iss, i) => (
                <li key={i} className="text-xs text-[#94A3B8] flex gap-2">
                  <span className="text-amber-400 flex-shrink-0 mt-0.5">›</span>
                  <span>{iss}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {raw && (
          <button
            onClick={() => setOpen(v => !v)}
            className="text-xs text-[#2563EB] hover:text-[#06B6D4] flex-shrink-0 mt-0.5 transition-colors"
            aria-expanded={open}
          >
            {open ? 'Masquer' : 'Voir brut'}
          </button>
        )}
      </div>
      {open && raw && (
        <div className="px-4 pb-4">
          <pre className="text-xs text-[#94A3B8] bg-[#0B1929] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed border border-[#1E3A5F]/40">
            {Array.isArray(raw) ? raw.join('\n') : raw}
          </pre>
        </div>
      )}
    </div>
  )
}

/* ─── How to fix section ─── */
function HowToFix({ domain }) {
  return (
    <div className="mt-8 rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60 p-6 sm:p-8">
      <h2 className="text-lg font-bold text-[#F8FAFC] mb-4">Comment corriger</h2>

      <p className="text-sm text-[#94A3B8] mb-4">
        Commencez toujours par la <strong className="text-[#F8FAFC]">surveillance (p=none)</strong> afin
        de collecter des rapports sans risquer de bloquer des emails légitimes. Analysez les rapports
        pendant 2 à 4 semaines via un service comme dmarcian ou Postmark, puis passez à{' '}
        <code className="text-[#06B6D4]">p=quarantine</code> puis <code className="text-[#06B6D4]">p=reject</code>.
      </p>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-2">Étape 1 — Surveillance</p>
          <pre className="text-xs text-[#06B6D4] bg-[#0B1929] rounded-lg p-3 overflow-x-auto border border-[#1E3A5F]/40 leading-relaxed">
{`_dmarc.${domain || 'votre-domaine.fr'}  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@${domain || 'votre-domaine.fr'}; pct=100; adkim=r; aspf=r"`}
          </pre>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-2">Étape 2 — Quarantaine (après analyse des rapports)</p>
          <pre className="text-xs text-[#06B6D4] bg-[#0B1929] rounded-lg p-3 overflow-x-auto border border-[#1E3A5F]/40 leading-relaxed">
{`_dmarc.${domain || 'votre-domaine.fr'}  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain || 'votre-domaine.fr'}; pct=25; adkim=r; aspf=r"`}
          </pre>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#475569] uppercase tracking-wider mb-2">Étape 3 — Rejet (protection complète)</p>
          <pre className="text-xs text-[#06B6D4] bg-[#0B1929] rounded-lg p-3 overflow-x-auto border border-[#1E3A5F]/40 leading-relaxed">
{`_dmarc.${domain || 'votre-domaine.fr'}  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc@${domain || 'votre-domaine.fr'}; pct=100; adkim=s; aspf=s"`}
          </pre>
        </div>
      </div>

      <p className="text-xs text-[#475569] mt-4">
        DKIM n'est pas analysé ici — les sélecteurs ne sont pas énumérables par DNS. Votre fournisseur d'emails vous donnera votre sélecteur DKIM actuel.
      </p>
    </div>
  )
}

/* ─── CTA section ─── */
function CTABlock() {
  return (
    <div className="mt-8 rounded-2xl bg-gradient-to-br from-[#1A1F2E] to-[#0f172a] border border-[#2563EB]/30 p-6 sm:p-8 text-center">
      <h2 className="text-lg font-bold text-[#F8FAFC] mb-2">Besoin d'aide pour corriger votre configuration ?</h2>
      <p className="text-sm text-[#94A3B8] mb-6 max-w-xl mx-auto">
        ShadowPulse peut auditer et surveiller votre domaine en continu, vous alerter dès qu'un problème apparaît, et vous accompagner dans la mise en œuvre de DMARC, SPF et DKIM.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={CALENDLY}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] hover:from-[#3b82f6] hover:to-[#2563EB] transition-all duration-200"
        >
          Réserver un créneau gratuit
        </a>
        <a
          href={`${BASE}#contact`}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-[#94A3B8] border border-[#1E3A5F] hover:border-[#2563EB]/50 hover:text-white transition-all duration-200"
        >
          Nous écrire
        </a>
      </div>
    </div>
  )
}

/* ─── Main page ─── */
export default function Diagnostic() {
  const [input, setInput]     = useState('')
  const [domain, setDomain]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError]     = useState(null)
  const inputRef = useRef(null)

  const run = useCallback(async (rawInput) => {
    const normalized = normalizeDomain(rawInput || input)
    const { valid, reason } = validateDomain(normalized)
    if (!valid) { setError(reason); return }
    if (isRateLimited()) {
      setError('Limite atteinte : 5 analyses par minute. Veuillez patienter.')
      return
    }
    setError(null)
    setLoading(true)
    setResults(null)
    setDomain(normalized)

    try {
      const soaRes = await lookupSOA(normalized)
      if (!soaRes.exists) {
        setError("Domaine introuvable, vérifiez l'orthographe.")
        setLoading(false)
        return
      }

      const [dmarcRes, spfRes, mxRes] = await Promise.all([
        lookupTXT(`_dmarc.${normalized}`),
        lookupTXT(normalized),
        lookupMX(normalized),
      ])

      const mxResult = analyzeMX(mxRes)
      const dmarcResult = analyzeDMARC(dmarcRes)
      if (!mxResult.present && dmarcResult.verdict !== 'absent' && dmarcResult.verdict !== 'error' && dmarcResult.verdict !== 'timeout') {
        dmarcResult.issues = [...dmarcResult.issues, "Ce domaine n'a pas de serveur de messagerie : DMARC est peu pertinent."]
      }

      setResults({
        dmarc: dmarcResult,
        spf:   analyzeSPF(spfRes),
        mx:    mxResult,
      })
    } catch (err) {
      setError(`Erreur inattendue : ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [input])

  const handleSubmit = (e) => {
    e.preventDefault()
    run()
  }

  /* Global verdict — driven by DMARC only */
  let globalVerdict = null
  if (results) {
    const dv = results.dmarc.verdict
    if (dv === 'protégé') globalVerdict = 'protégé'
    else if (dv === 'quarantaine' || dv === 'quarantaine partielle') globalVerdict = 'surveillance'
    else globalVerdict = 'absent'
  }

  return (
    <>
      <Navbar linkPrefix={BASE} logoHref={BASE} />
      <main id="main-content">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#2563EB] focus:text-white focus:rounded-lg text-sm font-medium">
          Aller au contenu principal
        </a>

        {/* Header */}
        <section className="relative pt-32 pb-12 bg-[#0B1929]">
          <div className="absolute inset-0 grid-overlay opacity-20 pointer-events-none" aria-hidden="true" />
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1A1F2E]/80 border border-[#2563EB]/30 mb-6 text-xs font-semibold text-[#06B6D4] uppercase tracking-widest">
              Outil gratuit · Aucune inscription
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-4">
              Diagnostic DNS gratuit
            </h1>
            <p className="text-[#94A3B8] max-w-xl mx-auto mb-3">
              Vérifiez en quelques secondes si votre domaine est protégé contre l'usurpation d'identité par email (DMARC, SPF, MX).
            </p>
            <p className="text-xs text-[#475569]">
              Les noms de domaine saisis sont transmis au résolveur DNS de Cloudflare (cloudflare-dns.com) et, en cas d'indisponibilité, à celui de Google (dns.google). Aucune donnée n'est conservée par ShadowPulse.
            </p>
          </div>
        </section>

        {/* Search form */}
        <section className="pb-8 bg-[#0B1929]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <form onSubmit={handleSubmit} className="flex gap-3" role="search" aria-label="Diagnostic de domaine">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="exemple.fr  ou  contact@exemple.fr"
                  aria-label="Domaine ou adresse email"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-[#1A1F2E] border border-[#1E3A5F] hover:border-[#2563EB]/50 focus:border-[#2563EB] rounded-xl px-4 py-3 text-sm text-[#F8FAFC] placeholder-[#475569] outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] hover:from-[#3b82f6] hover:to-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
              >
                {loading ? 'Analyse…' : 'Analyser'}
              </button>
            </form>

            {error && (
              <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
                <span aria-hidden="true">⚠</span> {error}
              </p>
            )}

            <p className="mt-2 text-xs text-[#475569]">
              Limite : 5 analyses par minute · Requêtes DNS uniquement, aucun scan de ports ni connexion au serveur analysé.
            </p>
          </div>
        </section>

        {/* Loading */}
        {loading && (
          <section className="pb-12">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60 p-8 flex items-center justify-center gap-3 text-[#94A3B8] text-sm">
                <svg className="w-5 h-5 animate-spin text-[#2563EB]" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Interrogation du résolveur DNS Cloudflare…
              </div>
            </div>
          </section>
        )}

        {/* Results */}
        {results && !loading && (
          <section className="pb-16">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

              {/* Global verdict */}
              <div className={`rounded-2xl border p-6 flex items-start gap-4 ${
                globalVerdict === 'protégé'     ? 'bg-emerald-500/5 border-emerald-500/30' :
                globalVerdict === 'surveillance' ? 'bg-amber-500/5  border-amber-500/30'   :
                                                   'bg-red-500/5    border-red-500/30'
              }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl ${
                  globalVerdict === 'protégé'      ? 'bg-emerald-500/20' :
                  globalVerdict === 'surveillance'  ? 'bg-amber-500/20'   :
                                                      'bg-red-500/20'
                }`} aria-hidden="true">
                  {globalVerdict === 'protégé' ? '✓' : globalVerdict === 'surveillance' ? '~' : '✗'}
                </div>
                <div>
                  <p className={`font-bold text-base capitalize ${
                    globalVerdict === 'protégé'      ? 'text-emerald-400' :
                    globalVerdict === 'surveillance'  ? 'text-amber-400'   : 'text-red-400'
                  }`}>
                    {globalVerdict === 'protégé'
                      ? `${domain} — Protection active`
                      : globalVerdict === 'surveillance'
                      ? `${domain} — Surveillance en place, protection incomplète`
                      : `${domain} — Protection insuffisante`}
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    Cela ne signifie pas qu'il y ait eu usurpation : c'est un point de configuration à corriger de manière préventive.
                  </p>
                </div>
              </div>

              {/* Detail table */}
              <div className="rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#1E3A5F]/60">
                  <h2 className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wider">Détail des enregistrements</h2>
                </div>

                <Row
                  label="DMARC (_dmarc)"
                  badge={{ verdict: results.dmarc.verdict, label: verdictLabel(results.dmarc.verdict, results.dmarc.pct) }}
                  issues={results.dmarc.issues}
                  raw={results.dmarc.raw}
                />

                <Row
                  label="SPF (v=spf1)"
                  badge={{ verdict: results.spf.verdict, label: verdictLabel(results.spf.verdict) }}
                  issues={results.spf.issues}
                  raw={results.spf.raw}
                />

                <Row
                  label="MX (serveurs de messagerie)"
                  badge={{ verdict: results.mx.verdict, label: results.mx.present ? `${results.mx.count} enregistrement${results.mx.count > 1 ? 's' : ''}` : 'Absent' }}
                  issues={results.mx.present ? [] : ['Aucun serveur de messagerie configuré.']}
                  raw={null}
                />

                <div className="px-4 py-3 text-xs text-[#475569]">
                  DKIM non analysé — les sélecteurs DKIM ne sont pas énumérables par DNS sans connaître le sélecteur utilisé par votre fournisseur d'emails.
                </div>
              </div>

              {/* Extra DMARC detail */}
              {results.dmarc.policy && (
                <div className="rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60 p-4 sm:p-6">
                  <h2 className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Détail DMARC</h2>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Politique (p)', value: results.dmarc.policy },
                      { label: 'Pourcentage (pct)', value: `${results.dmarc.pct ?? 100} %` },
                      { label: 'Rapports (rua)', value: results.dmarc.rua || 'Non défini' },
                      { label: 'Sous-domaines (sp)', value: results.dmarc.sp || 'hérite de p' },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <dt className="text-xs text-[#475569] mb-1">{label}</dt>
                        <dd className="text-sm font-semibold text-[#F8FAFC] break-all">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <HowToFix domain={domain} />
              <CTABlock />
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  )
}

function verdictLabel(v, pct) {
  const map = {
    protégé: 'Protégé', quarantaine: 'Quarantaine', 'quarantaine partielle': `Quarantaine partielle (pct=${pct ?? ''})`,
    surveillance: 'Surveillance', strict: 'Strict (-all)', acceptable: 'Acceptable (~all)',
    faible: 'Faible (?all)', dangereux: 'Dangereux (+all)', absent: 'Absent',
    invalid: 'Invalide', timeout: 'Timeout', error: 'Erreur',
  }
  return map[v] || v
}
