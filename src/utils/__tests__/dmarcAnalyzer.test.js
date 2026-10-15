import { describe, it, expect } from 'vitest'
import {
  normalizeDomain,
  validateDomain,
  analyzeDMARC,
  analyzeSPF,
  analyzeMX,
} from '../dmarcAnalyzer.js'

/* ─── normalizeDomain ─── */
describe('normalizeDomain', () => {
  it('strips https and www', () => {
    expect(normalizeDomain('https://www.exemple.fr/chemin?q=1')).toBe('exemple.fr')
  })
  it('extracts domain from email', () => {
    expect(normalizeDomain('contact@cabinet-martin.fr')).toBe('cabinet-martin.fr')
  })
  it('lowercases', () => {
    expect(normalizeDomain('EXEMPLE.FR')).toBe('exemple.fr')
  })
  it('trims whitespace', () => {
    expect(normalizeDomain('  exemple.fr  ')).toBe('exemple.fr')
  })
})

/* ─── validateDomain ─── */
describe('validateDomain', () => {
  it('accepts valid domains', () => {
    expect(validateDomain('exemple.fr').valid).toBe(true)
    expect(validateDomain('sub.domaine.co.uk').valid).toBe(true)
  })
  it('rejects IPv4', () => {
    expect(validateDomain('192.168.1.1').valid).toBe(false)
  })
  it('rejects empty string', () => {
    expect(validateDomain('').valid).toBe(false)
  })
  it('rejects domain with spaces', () => {
    expect(validateDomain('exem ple.fr').valid).toBe(false)
  })
  it('rejects TLD only', () => {
    expect(validateDomain('fr').valid).toBe(false)
  })
})

/* ─── analyzeDMARC ─── */
describe('analyzeDMARC', () => {
  it('returns absent on NXDOMAIN', () => {
    const r = analyzeDMARC({ records: [], nxdomain: true, error: null, timedOut: false })
    expect(r.verdict).toBe('absent')
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('returns absent on empty TXT', () => {
    const r = analyzeDMARC({ records: [], nxdomain: false, error: null, timedOut: false })
    expect(r.verdict).toBe('absent')
  })

  it('returns timeout on timedOut', () => {
    const r = analyzeDMARC({ records: [], nxdomain: false, error: null, timedOut: true })
    expect(r.verdict).toBe('timeout')
  })

  it('returns error on error', () => {
    const r = analyzeDMARC({ records: [], nxdomain: false, error: 'DNS error 2', timedOut: false })
    expect(r.verdict).toBe('error')
    expect(r.issues).toContain('DNS error 2')
  })

  it('parses p=none → verdict surveillance', () => {
    const r = analyzeDMARC({
      records: ['v=DMARC1; p=none; rua=mailto:dmarc@ex.fr'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('surveillance')
    expect(r.policy).toBe('none')
    expect(r.rua).toBe('mailto:dmarc@ex.fr')
  })

  it('p=none without rua warns', () => {
    const r = analyzeDMARC({
      records: ['v=DMARC1; p=none'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.issues.some(i => i.includes('rua'))).toBe(true)
  })

  it('parses p=quarantine pct=100 → verdict quarantaine', () => {
    const r = analyzeDMARC({
      records: ['v=DMARC1; p=quarantine; pct=100; rua=mailto:x@ex.fr'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('quarantaine')
    expect(r.policy).toBe('quarantine')
    expect(r.pct).toBe(100)
  })

  it('quarantine with pct<100 → verdict quarantaine partielle', () => {
    const r = analyzeDMARC({
      records: ['v=DMARC1; p=quarantine; pct=25'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('quarantaine partielle')
    expect(r.issues.some(i => i.includes('pct=25'))).toBe(true)
  })

  it('parses p=reject → verdict protégé', () => {
    const r = analyzeDMARC({
      records: ['v=DMARC1; p=reject; pct=100; rua=mailto:x@ex.fr'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('protégé')
  })

  it('returns invalid on multiple DMARC records', () => {
    const r = analyzeDMARC({
      records: ['v=DMARC1; p=none', 'v=DMARC1; p=reject'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('invalid')
    expect(r.issues[0]).toMatch(/plusieurs/i)
  })

  it('correctly parses sp tag', () => {
    const r = analyzeDMARC({
      records: ['v=DMARC1; p=reject; sp=quarantine; pct=100'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.sp).toBe('quarantine')
  })
})

/* ─── analyzeSPF ─── */
describe('analyzeSPF', () => {
  it('returns absent on NXDOMAIN', () => {
    const r = analyzeSPF({ records: [], nxdomain: true, error: null, timedOut: false })
    expect(r.verdict).toBe('absent')
  })

  it('returns absent on no SPF record', () => {
    const r = analyzeSPF({
      records: ['v=DMARC1; p=none'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('absent')
  })

  it('+all is flagged dangerous', () => {
    const r = analyzeSPF({
      records: ['v=spf1 include:_spf.google.com +all'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.issues.some(i => i.includes('+all'))).toBe(true)
  })

  it('~all → verdict acceptable (existing test)', () => {
    const r = analyzeSPF({
      records: ['v=spf1 include:_spf.google.com ~all'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('acceptable')
    expect(r.qualifier).toBe('~')
  })

  it('-all → verdict strict', () => {
    const r = analyzeSPF({
      records: ['v=spf1 include:_spf.google.com -all'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('strict')
    expect(r.qualifier).toBe('-')
  })

  it('?all warns', () => {
    const r = analyzeSPF({
      records: ['v=spf1 ?all'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.issues.some(i => i.includes('?all'))).toBe(true)
  })

  it('warns when include count > 10', () => {
    const includes = Array.from({ length: 11 }, (_, i) => `include:spf${i}.ex.fr`).join(' ')
    const r = analyzeSPF({
      records: [`v=spf1 ${includes} -all`],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.issues.some(i => i.includes('limite de 10'))).toBe(true)
  })

  it('warns approaching limit (> 7)', () => {
    const includes = Array.from({ length: 9 }, (_, i) => `include:spf${i}.ex.fr`).join(' ')
    const r = analyzeSPF({
      records: [`v=spf1 ${includes} -all`],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.issues.some(i => i.includes('approche la limite'))).toBe(true)
  })

  it('returns invalid on multiple SPF records', () => {
    const r = analyzeSPF({
      records: ['v=spf1 ~all', 'v=spf1 -all'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('invalid')
  })

  it('returns timeout on timedOut', () => {
    const r = analyzeSPF({ records: [], nxdomain: false, error: null, timedOut: true })
    expect(r.verdict).toBe('timeout')
  })

  it('~all → verdict acceptable', () => {
    const r = analyzeSPF({
      records: ['v=spf1 include:_spf.google.com ~all'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('acceptable')
  })

  it('-all → verdict strict', () => {
    const r = analyzeSPF({
      records: ['v=spf1 include:_spf.google.com -all'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('strict')
  })
})

/* ─── analyzeMX ─── */
describe('analyzeMX', () => {
  it('returns absent when no MX', () => {
    const r = analyzeMX({ records: [], nxdomain: false, error: null, timedOut: false })
    expect(r.verdict).toBe('absent')
    expect(r.present).toBe(false)
  })

  it('returns présent when MX found', () => {
    const r = analyzeMX({
      records: ['10 mail.exemple.fr.'],
      nxdomain: false, error: null, timedOut: false,
    })
    expect(r.verdict).toBe('présent')
    expect(r.present).toBe(true)
    expect(r.count).toBe(1)
  })

  it('returns absent on NXDOMAIN', () => {
    const r = analyzeMX({ records: [], nxdomain: true, error: null, timedOut: false })
    expect(r.present).toBe(false)
  })

  it('returns timeout', () => {
    const r = analyzeMX({ records: [], nxdomain: false, error: null, timedOut: true })
    expect(r.verdict).toBe('timeout')
  })
})
