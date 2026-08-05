import React, { useEffect, useRef, useState, useCallback } from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import {
  IconShield, IconEye, IconBell, IconSearch, IconLink,
  IconUsers, IconTarget, IconCheck, IconX, IconLock, IconArrowRight,
} from './components/icons.jsx'

/* ─── Utility hook: fade-in on scroll ─── */
function useFadeIn() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          observer.unobserve(el)
        }
      },
      { threshold: 0.12 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}

/* ─── Network visualization (hero background) ─── */
function NetworkGraph() {
  const nodes = [
    { x: 20, y: 30, delay: 0 }, { x: 50, y: 15, delay: 0.5 },
    { x: 78, y: 25, delay: 1 }, { x: 35, y: 55, delay: 1.5 },
    { x: 65, y: 60, delay: 0.8 }, { x: 85, y: 45, delay: 0.3 },
    { x: 15, y: 65, delay: 1.2 }, { x: 55, y: 80, delay: 0.6 },
  ]
  const edges = [
    [0, 1], [1, 2], [1, 4], [0, 3], [3, 4], [4, 5], [2, 5], [3, 6], [4, 7],
  ]
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 w-full h-full opacity-30"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke="#2563EB"
          strokeWidth="0.3"
          strokeDasharray="1 2"
          opacity="0.5"
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="1.2" fill="#06B6D4" opacity="0.8">
            <animate
              attributeName="r"
              values="1.2;1.8;1.2"
              dur={`${2.5 + n.delay}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.8;1;0.8"
              dur={`${2.5 + n.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
          <circle cx={n.x} cy={n.y} r="2.5" fill="none" stroke="#06B6D4" strokeWidth="0.3" opacity="0.3">
            <animate
              attributeName="r"
              values="2.5;4;2.5"
              dur={`${3 + n.delay}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.3;0;0.3"
              dur={`${3 + n.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        </g>
      ))}
    </svg>
  )
}

/* ─── Hero Section ─── */
function HeroSection() {
  const heroRef = useRef(null)
  const contentRef = useRef(null)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      setScrollY(window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scale = 1 + scrollY * 0.0008
  const opacity = Math.max(0, 1 - scrollY * 0.003)

  return (
    <section
      ref={heroRef}
      className="relative min-h-dvh flex items-center justify-center overflow-hidden hero-bg"
      aria-labelledby="hero-heading"
    >
      {/* Grid overlay */}
      <div className="absolute inset-0 grid-overlay pointer-events-none" aria-hidden="true" />

      {/* Network animation — zoom au scroll */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `scale(${scale})`,
          opacity,
          transition: 'none',
          transformOrigin: 'center center',
        }}
        aria-hidden="true"
      >
        <NetworkGraph />
      </div>

      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2563EB]/8 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-[#06B6D4]/6 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      {/* Content */}
      <div
        ref={contentRef}
        className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center"
        style={{ opacity }}
      >
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1A1F2E]/80 border border-[#2563EB]/30 mb-8 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-[#06B6D4] flex-shrink-0" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} aria-hidden="true" />
          <span className="text-xs font-semibold text-[#06B6D4] uppercase tracking-widest">
            Conforme RGPD · NIS2
          </span>
        </div>

        <h1
          id="hero-heading"
          className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#F8FAFC] leading-tight mb-6"
        >
          CTI + Digital Risk Monitoring
          <span className="block mt-2 bg-gradient-to-r from-[#2563EB] to-[#06B6D4] bg-clip-text text-transparent">
            pour PME et cabinets comptables
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-[#94A3B8] max-w-2xl mx-auto mb-10 leading-relaxed">
          ShadowPulse surveille les menaces en temps réel, détecte vos expositions numériques
          et vous alerte avant que l'incident survienne — sans DSI, sans complexité.
        </p>

        {/* Stats */}
        <div className="flex flex-wrap justify-center gap-8 mb-10">
          {[
            { value: '43%', label: 'des cyberattaques ciblent les PME' },
            { value: '<2h', label: 'délai de détection moyen' },
            { value: '99.9%', label: 'disponibilité du monitoring' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="stat-number text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-[#94A3B8] mt-1 max-w-[120px]">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="#contact"
            className="btn-primary inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-white cursor-pointer"
          >
            Demander une démo gratuite
            <IconArrowRight size={18} />
          </a>
          <a
            href="#solution"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-[#94A3B8] border border-[#1E3A5F] hover:border-[#2563EB]/50 hover:text-white transition-all duration-200 cursor-pointer"
          >
            Découvrir la solution
          </a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2" aria-hidden="true">
        <div className="w-px h-12 bg-gradient-to-b from-transparent to-[#2563EB]/50" />
        <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB]/60" />
      </div>
    </section>
  )
}

/* ─── Problem Section ─── */
function ProblemSection() {
  const ref = useFadeIn()
  const items = [
    {
      icon: <IconTarget size={22} className="text-[#06B6D4]" />,
      title: 'Cibles de choix pour les cybercriminels',
      desc: 'Les PME et cabinets comptables détiennent des données sensibles (bilans, liasses fiscales, RIB) sans les défenses d\'une grande entreprise. Ils représentent 43 % des victimes de ransomwares en France.',
    },
    {
      icon: <IconUsers size={22} className="text-[#06B6D4]" />,
      title: 'Absence de ressources cyber dédiées',
      desc: 'Sans RSSI ni SOC interne, les PME ne disposent pas des outils pour détecter une compromission. En moyenne, une intrusion reste invisible 207 jours avant d\'être découverte.',
    },
    {
      icon: <IconLock size={22} className="text-[#06B6D4]" />,
      title: 'Conformité RGPD & NIS2 — une obligation',
      desc: 'La directive NIS2 étend ses obligations aux PME de secteurs essentiels et importants. Une non-conformité expose à des amendes jusqu\'à 10 M€ ou 2 % du CA mondial.',
    },
    {
      icon: <IconBell size={22} className="text-[#06B6D4]" />,
      title: 'Réputation et continuité d\'activité en jeu',
      desc: 'Une fuite de données client ou une paralysie par ransomware peut compromettre définitivement la relation de confiance avec vos clients et partenaires financiers.',
    },
  ]

  return (
    <section id="probleme" className="relative py-24 bg-[#0B1929]" aria-labelledby="problem-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={ref} className="fade-in text-center mb-16">
          <span className="inline-block text-xs font-semibold text-[#2563EB] uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-[#2563EB]/30 bg-[#2563EB]/5">
            Le contexte
          </span>
          <h2 id="problem-heading" className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-4">
            Pourquoi les PME sont{' '}
            <span className="text-[#06B6D4]">des cibles prioritaires</span>
          </h2>
          <p className="text-[#94A3B8] max-w-2xl mx-auto text-lg">
            Les attaquants s'adaptent. Ils savent que les petites structures protègent moins bien
            leurs actifs numériques — et en tirent profit.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {items.map((item, i) => {
            const cardRef = useFadeIn()
            return (
              <div
                key={i}
                ref={cardRef}
                className={`fade-in fade-in-delay-${i + 1} card-hover p-6 rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#06B6D4]/10 flex items-center justify-center mb-4">
                  {item.icon}
                </div>
                <h3 className="text-base font-semibold text-[#F8FAFC] mb-3">{item.title}</h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed">{item.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── Solution Section ─── */
function SolutionSection() {
  const ref = useFadeIn()
  const features = [
    {
      icon: <IconSearch size={24} className="text-[#2563EB]" />,
      title: 'Audit de surface d\'attaque',
      desc: 'Cartographie automatique de vos actifs exposés : domaines, IPs, certificats, ports ouverts, dark web. Rapport exécutif en 48h.',
      badge: 'Audit initial',
    },
    {
      icon: <IconEye size={24} className="text-[#2563EB]" />,
      title: 'Monitoring continu 24/7',
      desc: 'Surveillance permanente de vos assets numériques, détection des nouvelles expositions, des fuites de credentials et des mentions sur forums cybercriminels.',
      badge: 'Temps réel',
    },
    {
      icon: <IconBell size={24} className="text-[#2563EB]" />,
      title: 'Alertes contextualisées',
      desc: 'Notifications priorisées avec contexte opérationnel : criticité, vecteur d\'attaque probable, actions recommandées. Zéro bruit, signal fort.',
      badge: 'Intelligence',
    },
    {
      icon: <IconShield size={24} className="text-[#2563EB]" />,
      title: 'CTI (Cyber Threat Intelligence)',
      desc: 'Flux de renseignements sur les groupes d\'attaquants actifs dans votre secteur, les campagnes en cours et les indicateurs de compromission (IOCs).',
      badge: 'CTI',
    },
    {
      icon: <IconLink size={24} className="text-[#2563EB]" />,
      title: 'Intégration GLPI & OpenCTI',
      desc: 'Synchronisation native avec votre GLPI pour la gestion d\'incidents et OpenCTI pour la corrélation de renseignements. API REST disponible.',
      badge: 'Intégrations',
    },
    {
      icon: <IconLock size={24} className="text-[#2563EB]" />,
      title: 'Conformité RGPD / NIS2',
      desc: 'Tableaux de bord de conformité, journaux d\'audit exportables, rapports prêts pour votre DPO ou pour répondre à une obligation réglementaire.',
      badge: 'Compliance',
    },
  ]

  return (
    <section id="solution" className="relative py-24 bg-[#111827]" aria-labelledby="solution-heading">
      <div className="absolute inset-0 grid-overlay opacity-30 pointer-events-none" aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div ref={ref} className="fade-in text-center mb-16">
          <span className="inline-block text-xs font-semibold text-[#2563EB] uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-[#2563EB]/30 bg-[#2563EB]/5">
            Notre approche
          </span>
          <h2 id="solution-heading" className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-4">
            Une plateforme conçue pour{' '}
            <span className="bg-gradient-to-r from-[#2563EB] to-[#06B6D4] bg-clip-text text-transparent">
              les structures sans DSI
            </span>
          </h2>
          <p className="text-[#94A3B8] max-w-2xl mx-auto text-lg">
            ShadowPulse centralise la surveillance, la détection et la réponse dans une interface
            claire — sans expertise technique requise de votre côté.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat, i) => {
            const cardRef = useFadeIn()
            return (
              <div
                key={i}
                ref={cardRef}
                className={`fade-in fade-in-delay-${(i % 3) + 1} card-hover group p-6 rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60 flex flex-col`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#2563EB]/10 flex items-center justify-center group-hover:bg-[#2563EB]/20 transition-colors duration-200">
                    {feat.icon}
                  </div>
                  <span className="text-xs font-medium text-[#06B6D4] bg-[#06B6D4]/10 px-2.5 py-1 rounded-full border border-[#06B6D4]/20">
                    {feat.badge}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-[#F8FAFC] mb-2">{feat.title}</h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed flex-1">{feat.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── Pricing Section ─── */
function PricingSection() {
  const ref = useFadeIn()

  const plans = [
    {
      name: 'Essentiel',
      price: '290',
      desc: 'Pour les TPE et cabinets jusqu\'à 20 collaborateurs',
      popular: false,
      features: [
        { label: 'Audit surface d\'attaque initial', included: true },
        { label: 'Monitoring 5 domaines', included: true },
        { label: 'Alertes email (délai 4h)', included: true },
        { label: 'Rapport mensuel PDF', included: true },
        { label: 'Dark web monitoring basique', included: true },
        { label: 'CTI — flux de menaces sectoriels', included: false },
        { label: 'Alertes temps réel (< 30 min)', included: false },
        { label: 'Intégration GLPI / OpenCTI', included: false },
        { label: 'Tableau de bord conformité NIS2', included: false },
        { label: 'Support dédié & SLA garanti', included: false },
      ],
      cta: 'Commencer',
      color: 'border-[#1E3A5F]/60',
    },
    {
      name: 'Premium',
      price: '590',
      desc: 'Pour les PME et cabinets jusqu\'à 100 collaborateurs',
      popular: true,
      features: [
        { label: 'Audit surface d\'attaque initial', included: true },
        { label: 'Monitoring 20 domaines', included: true },
        { label: 'Alertes email + SMS (délai 30 min)', included: true },
        { label: 'Rapports hebdomadaires & mensuels', included: true },
        { label: 'Dark web monitoring avancé', included: true },
        { label: 'CTI — flux de menaces sectoriels', included: true },
        { label: 'Alertes temps réel (< 30 min)', included: true },
        { label: 'Intégration GLPI / OpenCTI', included: true },
        { label: 'Tableau de bord conformité NIS2', included: false },
        { label: 'Support dédié & SLA garanti', included: false },
      ],
      cta: 'Démarrer — Offre la plus populaire',
      color: 'border-[#2563EB]',
    },
    {
      name: 'Enterprise',
      price: null,
      desc: 'Pour les groupes, réseaux de cabinets et structures multi-entités',
      popular: false,
      features: [
        { label: 'Audit surface d\'attaque initial', included: true },
        { label: 'Monitoring domaines illimité', included: true },
        { label: 'Alertes multicanal temps réel', included: true },
        { label: 'Rapports sur mesure', included: true },
        { label: 'Dark web monitoring premium', included: true },
        { label: 'CTI — flux de menaces sectoriels', included: true },
        { label: 'Alertes temps réel (< 30 min)', included: true },
        { label: 'Intégration GLPI / OpenCTI', included: true },
        { label: 'Tableau de bord conformité NIS2', included: true },
        { label: 'Support dédié & SLA garanti', included: true },
      ],
      cta: 'Nous contacter',
      color: 'border-[#1E3A5F]/60',
    },
  ]

  return (
    <section id="tarifs" className="relative py-24 bg-[#0B1929]" aria-labelledby="pricing-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={ref} className="fade-in text-center mb-16">
          <span className="inline-block text-xs font-semibold text-[#2563EB] uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-[#2563EB]/30 bg-[#2563EB]/5">
            Tarification
          </span>
          <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-4">
            Des offres claires,{' '}
            <span className="text-[#06B6D4]">sans surprise</span>
          </h2>
          <p className="text-[#94A3B8] max-w-xl mx-auto text-lg">
            Engagement mensuel, résiliable à tout moment. Mise en service en moins de 48h.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan, i) => {
            const cardRef = useFadeIn()
            return (
              <div
                key={i}
                ref={cardRef}
                className={`fade-in fade-in-delay-${i + 1} relative rounded-2xl border-2 ${plan.color} ${
                  plan.popular ? 'pricing-popular' : 'bg-[#1A1F2E]'
                } p-8 flex flex-col`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap glow-blue">
                      Le plus populaire
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-[#F8FAFC] mb-2">{plan.name}</h3>
                  <p className="text-sm text-[#94A3B8] mb-4">{plan.desc}</p>
                  <div className="flex items-end gap-1">
                    {plan.price ? (
                      <>
                        <span className="text-4xl font-bold text-[#F8FAFC]">{plan.price}€</span>
                        <span className="text-[#94A3B8] mb-1">/mois HT</span>
                      </>
                    ) : (
                      <span className="text-2xl font-bold text-[#F8FAFC]">Sur devis</span>
                    )}
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1" role="list" aria-label={`Fonctionnalités ${plan.name}`}>
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <span
                        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                          feat.included
                            ? 'bg-[#2563EB]/20 text-[#2563EB]'
                            : 'bg-[#1E3A5F]/40 text-[#475569]'
                        }`}
                        aria-hidden="true"
                      >
                        {feat.included ? <IconCheck size={11} /> : <IconX size={11} />}
                      </span>
                      <span
                        className={`text-sm ${feat.included ? 'text-[#CBD5E1]' : 'text-[#475569]'}`}
                      >
                        {feat.label}
                        {!feat.included && <span className="sr-only"> (non inclus)</span>}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#contact"
                  className={`block text-center py-3.5 px-6 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    plan.popular
                      ? 'btn-primary text-white'
                      : 'border border-[#1E3A5F] text-[#94A3B8] hover:border-[#2563EB]/50 hover:text-white'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── Contact / CTA Section ─── */
function ContactSection() {
  const ref = useFadeIn()
  const formRef = useFadeIn()
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    message: '',
  })
  const [status, setStatus] = useState('idle') // idle | sending | success | error
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!formData.name.trim()) e.name = 'Votre nom est requis'
    if (!formData.company.trim()) e.company = 'Le nom de votre structure est requis'
    if (!formData.email.trim()) e.email = 'Votre email professionnel est requis'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) e.email = 'Email invalide'
    return e
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      const firstKey = Object.keys(errs)[0]
      document.getElementById(`field-${firstKey}`)?.focus()
      return
    }
    setStatus('sending')
    await new Promise(r => setTimeout(r, 1200))
    setStatus('success')
  }

  const inputClass = (field) =>
    `w-full bg-[#0B1929] border rounded-xl px-4 py-3 text-sm text-[#F8FAFC] placeholder-[#475569] transition-all duration-200 ${
      errors[field]
        ? 'border-red-500/70 focus:border-red-500'
        : 'border-[#1E3A5F] focus:border-[#2563EB]'
    }`

  const reassurances = [
    { icon: <IconLock size={16} className="text-[#06B6D4]" />, text: 'Infrastructure hébergée en France' },
    { icon: <IconShield size={16} className="text-[#06B6D4]" />, text: 'Conformité RGPD & NIS2 certifiée' },
    { icon: <IconCheck size={16} className="text-[#06B6D4]" />, text: 'Réponse sous 24h ouvrées' },
  ]

  return (
    <section id="contact" className="relative py-24 bg-[#111827]" aria-labelledby="contact-heading">
      <div className="absolute inset-0 grid-overlay opacity-20 pointer-events-none" aria-hidden="true" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-start">

          {/* Left — copy */}
          <div ref={ref} className="fade-in">
            <span className="inline-block text-xs font-semibold text-[#2563EB] uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-[#2563EB]/30 bg-[#2563EB]/5">
              Passer à l'action
            </span>
            <h2 id="contact-heading" className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-6">
              Demandez votre{' '}
              <span className="bg-gradient-to-r from-[#2563EB] to-[#06B6D4] bg-clip-text text-transparent">
                démo gratuite
              </span>
            </h2>
            <p className="text-[#94A3B8] text-lg mb-8 leading-relaxed">
              En 30 minutes, nous analysons votre surface d'attaque et identifions vos
              principales expositions — sans engagement, sans frais.
            </p>

            <div className="space-y-4 mb-10">
              {reassurances.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#06B6D4]/10 flex items-center justify-center flex-shrink-0">
                    {r.icon}
                  </div>
                  <span className="text-sm text-[#CBD5E1]">{r.text}</span>
                </div>
              ))}
            </div>

            {/* Calendly alternative */}
            <div className="p-5 rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60">
              <p className="text-sm text-[#94A3B8] mb-3">Préférez planifier directement ?</p>
              <a
                href="https://calendly.com/shadowpulse"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB] hover:text-[#06B6D4] transition-colors duration-200"
              >
                Réserver un créneau sur Calendly
                <IconArrowRight size={16} />
              </a>
            </div>
          </div>

          {/* Right — form */}
          <div ref={formRef} className="fade-in fade-in-delay-2">
            {status === 'success' ? (
              <div className="rounded-2xl bg-[#1A1F2E] border border-[#2563EB]/40 p-10 text-center">
                <div className="w-16 h-16 rounded-full bg-[#2563EB]/15 flex items-center justify-center mx-auto mb-5">
                  <IconCheck size={28} className="text-[#2563EB]" />
                </div>
                <h3 className="text-xl font-bold text-[#F8FAFC] mb-3">Message envoyé !</h3>
                <p className="text-[#94A3B8] text-sm leading-relaxed">
                  Notre équipe reviendra vers vous sous 24h ouvrées.
                  Vérifiez votre boîte mail (et les spams, au cas où).
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60 p-8 space-y-5"
                aria-label="Formulaire de contact"
              >
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="field-name" className="block text-xs font-semibold text-[#CBD5E1] mb-2">
                      Prénom & Nom <span className="text-red-400" aria-label="champ requis">*</span>
                    </label>
                    <input
                      id="field-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Jean Dupont"
                      className={inputClass('name')}
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? 'error-name' : undefined}
                    />
                    {errors.name && (
                      <p id="error-name" role="alert" className="mt-1.5 text-xs text-red-400">{errors.name}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="field-company" className="block text-xs font-semibold text-[#CBD5E1] mb-2">
                      Structure <span className="text-red-400" aria-label="champ requis">*</span>
                    </label>
                    <input
                      id="field-company"
                      name="company"
                      type="text"
                      autoComplete="organization"
                      required
                      value={formData.company}
                      onChange={handleChange}
                      placeholder="Cabinet Dupont & Associés"
                      className={inputClass('company')}
                      aria-invalid={!!errors.company}
                      aria-describedby={errors.company ? 'error-company' : undefined}
                    />
                    {errors.company && (
                      <p id="error-company" role="alert" className="mt-1.5 text-xs text-red-400">{errors.company}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="field-email" className="block text-xs font-semibold text-[#CBD5E1] mb-2">
                    Email professionnel <span className="text-red-400" aria-label="champ requis">*</span>
                  </label>
                  <input
                    id="field-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="jean@cabinet-dupont.fr"
                    className={inputClass('email')}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'error-email' : undefined}
                  />
                  {errors.email && (
                    <p id="error-email" role="alert" className="mt-1.5 text-xs text-red-400">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="field-phone" className="block text-xs font-semibold text-[#CBD5E1] mb-2">
                    Téléphone <span className="text-[#475569] text-xs font-normal">(optionnel)</span>
                  </label>
                  <input
                    id="field-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+33 6 00 00 00 00"
                    className={inputClass('phone')}
                  />
                </div>

                <div>
                  <label htmlFor="field-message" className="block text-xs font-semibold text-[#CBD5E1] mb-2">
                    Votre situation <span className="text-[#475569] text-xs font-normal">(optionnel)</span>
                  </label>
                  <textarea
                    id="field-message"
                    name="message"
                    rows={4}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Décrivez votre contexte, vos enjeux cyber, une situation spécifique…"
                    className={`${inputClass('message')} resize-none`}
                  />
                </div>

                <p className="text-xs text-[#475569] leading-relaxed">
                  En soumettant ce formulaire, vous acceptez notre{' '}
                  <a href={`${import.meta.env.BASE_URL}politique-de-confidentialite/`} className="text-[#2563EB] hover:underline">politique de confidentialité</a>.
                  Vos données ne sont jamais revendues.
                </p>

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="btn-primary w-full py-3.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {status === 'sending' ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Envoi en cours…
                    </>
                  ) : (
                    <>
                      Demander ma démo gratuite
                      <IconArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── App ─── */
export default function App() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#2563EB] focus:text-white focus:rounded-lg text-sm font-medium">
          Aller au contenu principal
        </a>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <PricingSection />
        <ContactSection />
      </main>
      <Footer />
    </>
  )
}
