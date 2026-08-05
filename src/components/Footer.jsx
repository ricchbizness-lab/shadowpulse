import React from 'react'
import { IconShield } from './icons.jsx'

const BASE = import.meta.env.BASE_URL

const legalLinks = [
  { label: 'Mentions légales', href: `${BASE}mentions-legales/` },
  { label: 'Politique de confidentialité', href: `${BASE}politique-de-confidentialite/` },
  { label: 'CGV', href: `${BASE}cgv/` },
]

/* ─── Footer ─── */
export default function Footer() {
  return (
    <footer className="bg-[#0B1929] border-t border-[#1E3A5F]/60 py-10" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <a href={BASE} className="flex items-center gap-2" aria-label="ShadowPulse — Accueil">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#06B6D4] flex items-center justify-center">
              <IconShield size={15} className="text-white" />
            </div>
            <span className="font-bold text-[#F8FAFC]">Shadow<span className="text-[#2563EB]">Pulse</span></span>
          </a>
          <nav className="flex gap-6" aria-label="Liens légaux">
            {legalLinks.map(link => (
              <a key={link.href} href={link.href} className="text-xs text-[#475569] hover:text-[#94A3B8] transition-colors">{link.label}</a>
            ))}
          </nav>
          <p className="text-xs text-[#475569]">
            © {new Date().getFullYear()} ShadowPulse — Tous droits réservés
          </p>
        </div>
      </div>
    </footer>
  )
}
