import React, { useEffect, useState } from 'react'
import { IconShield, IconMenu, IconClose } from './icons.jsx'

/* ─── Navbar ───
 * linkPrefix/logoHref default to homepage behavior (in-page anchors).
 * Legal subpages pass import.meta.env.BASE_URL so nav links point back
 * to the homepage sections instead of scrolling a page that has none.
 */
export default function Navbar({ linkPrefix = '', logoHref = '#' }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { label: 'Problème', href: `${linkPrefix}#probleme` },
    { label: 'Solution', href: `${linkPrefix}#solution` },
    { label: 'Tarifs', href: `${linkPrefix}#tarifs` },
    { label: 'Contact', href: `${linkPrefix}#contact` },
  ]

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#0B1929]/95 backdrop-blur-md border-b border-[#1E3A5F]/60 shadow-lg' : 'bg-transparent'
      }`}
      role="banner"
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Navigation principale">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href={logoHref} className="flex items-center gap-2 group" aria-label="ShadowPulse — Accueil">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
              <IconShield size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg text-[#F8FAFC] tracking-tight">
              Shadow<span className="text-[#2563EB]">Pulse</span>
            </span>
          </a>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors duration-200 font-medium"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href={`${linkPrefix}#contact`}
              className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer"
            >
              Demander une démo
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#1A1F2E] transition-colors cursor-pointer"
            onClick={() => setMobileOpen(v => !v)}
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <IconClose size={22} /> : <IconMenu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-[#1E3A5F]/60 py-4 space-y-1">
            {navLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="block px-4 py-3 text-[#94A3B8] hover:text-white hover:bg-[#1A1F2E] rounded-lg transition-colors text-sm font-medium"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="px-4 pt-2">
              <a
                href={`${linkPrefix}#contact`}
                className="btn-primary block text-center px-4 py-3 rounded-lg text-sm font-semibold text-white cursor-pointer"
                onClick={() => setMobileOpen(false)}
              >
                Demander une démo
              </a>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
