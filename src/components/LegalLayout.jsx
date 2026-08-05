import React from 'react'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'

const BASE = import.meta.env.BASE_URL

/* ─── Legal page shell ───
 * Same dark shell/nav/footer as the rest of the site, with a slightly
 * lighter reading surface and looser typography for dense legal text.
 */
export default function LegalLayout({ title, updated, children }) {
  return (
    <>
      <Navbar linkPrefix={BASE} logoHref={BASE} />
      <main id="main-content">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#2563EB] focus:text-white focus:rounded-lg text-sm font-medium">
          Aller au contenu principal
        </a>
        <section className="relative pt-32 pb-24 bg-[#0B1929]">
          <div className="absolute inset-0 grid-overlay opacity-20 pointer-events-none" aria-hidden="true" />
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <a href={`${BASE}`} className="inline-block text-sm text-[#2563EB] hover:text-[#06B6D4] transition-colors mb-8">
              ← Retour à l'accueil
            </a>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-3">{title}</h1>
            {updated && <p className="text-sm text-[#475569] mb-10">Dernière mise à jour : {updated}</p>}

            <div className="legal-content rounded-2xl bg-[#1A1F2E] border border-[#1E3A5F]/60 p-6 sm:p-10">
              {children}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
