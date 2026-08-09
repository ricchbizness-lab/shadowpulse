import React from 'react'
import LegalLayout from '../components/LegalLayout.jsx'

export default function Cgv() {
  return (
    <LegalLayout title="Conditions Générales de Vente" updated="9 août 2026">
      <p className="legal-meta">
        Les présentes Conditions Générales de Vente (CGV) régissent les relations
        contractuelles entre ShadowPulse SAS et ses clients professionnels souscrivant
        à un abonnement aux services décrits ci-dessous.
      </p>

      <h2>Article 1 — Objet</h2>
      <p>
        ShadowPulse SAS propose des services d'abonnement mensuel de Cyber Threat
        Intelligence (CTI) et de Digital Risk Monitoring destinés aux PME et cabinets
        comptables, incluant notamment l'audit de surface d'attaque, le monitoring
        continu, les alertes contextualisées et les intégrations tierces décrites sur
        le site.
      </p>

      <h2>Article 2 — Offres et tarifs</h2>
      <p>ShadowPulse propose trois formules d'abonnement :</p>
      <ul>
        <li><strong>Essentiel</strong> — 290 € HT / mois</li>
        <li><strong>Premium</strong> — 590 € HT / mois</li>
        <li><strong>Enterprise</strong> — sur devis, selon le périmètre et le nombre d'entités couvertes</li>
      </ul>
      <p>
        Les tarifs sont exprimés hors taxes et sont susceptibles d'évoluer ; toute
        modification tarifaire fait l'objet d'une information préalable du client et ne
        s'applique qu'aux échéances postérieures à son entrée en vigueur.
      </p>

      <h2>Article 3 — Durée, engagement et résiliation</h2>
      <p>
        L'abonnement est souscrit pour une durée mensuelle, reconduit tacitement chaque
        mois. Il peut être résilié par le client à tout moment, sous réserve du respect
        d'un <strong>préavis de 30 jours</strong> avant la prochaine échéance de
        facturation, par notification écrite à
        <a href="mailto:contact@shadowpulse.fr"> contact@shadowpulse.fr</a>.
      </p>

      <h2>Article 4 — Modalités de paiement</h2>
      <p>
        Les factures sont payables par virement bancaire ou prélèvement automatique,
        dans un délai de <strong>30 jours</strong> à compter de leur date d'émission.
        Tout retard de paiement pourra donner lieu aux pénalités et à l'indemnité
        forfaitaire de recouvrement prévues par la loi.
      </p>

      <h2>Article 5 — Responsabilité</h2>
      <p>
        ShadowPulse SAS met en œuvre les moyens raisonnables pour assurer la fiabilité
        de son service de monitoring et de détection. Sa responsabilité, quelle qu'en
        soit la cause, est expressément limitée au montant total des sommes effectivement
        versées par le client au titre de l'abonnement au cours des
        <strong> 12 derniers mois</strong> précédant le fait générateur. ShadowPulse SAS
        ne saurait être tenue responsable des dommages indirects, notamment toute perte
        d'exploitation, de données ou de chiffre d'affaires.
      </p>

      <h2>Article 6 — Droit applicable et juridiction compétente</h2>
      <p>
        Les présentes CGV sont soumises au droit français. Tout litige relatif à leur
        interprétation ou à leur exécution relève, à défaut de résolution amiable, de la
        compétence exclusive des tribunaux de Paris.
      </p>

      <h2>Article 7 — Éditeur</h2>
      <ul>
        <li><strong>PL &amp; PR Partners (ShadowPulse)</strong> — 66 Avenue des Champs-Élysées, 75008 Paris, France</li>
        <li><strong>SIRET :</strong> 949 324 719 00010</li>
        <li><strong>Directeur de publication :</strong> Patrick Lolot-Doressamy, Président de SAS</li>
        <li><strong>Contact :</strong> <a href="mailto:contact@shadowpulse.fr">contact@shadowpulse.fr</a></li>
      </ul>
    </LegalLayout>
  )
}
