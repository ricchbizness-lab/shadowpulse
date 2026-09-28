import React from 'react'
import LegalLayout from '../components/LegalLayout.jsx'

export default function PolitiqueConfidentialite() {
  return (
    <LegalLayout title="Politique de confidentialité" updated="28 septembre 2026">
      <p className="legal-meta">
        ShadowPulse SAS accorde une attention particulière à la protection des données
        personnelles de ses utilisateurs et prospects, conformément au Règlement Général
        sur la Protection des Données (RGPD — Règlement UE 2016/679) et à la loi
        Informatique et Libertés.
      </p>

      <h2>Responsable de traitement</h2>
      <p>
        Le responsable du traitement des données collectées sur ce site est
        <strong> ShadowPulse SAS</strong>, dont le siège social est situé au 66 Avenue des
        Champs-Élysées, 75008 Paris, France.
        Contact : <a href="mailto:etude-cyber@shadowpulse.fr">etude-cyber@shadowpulse.fr</a>.
      </p>

      <h2>Données collectées</h2>
      <p>
        Les seules données personnelles collectées sur ce site le sont via le
        formulaire de contact ("Demander une démo gratuite"). Il s'agit de :
      </p>
      <ul>
        <li>Nom et prénom</li>
        <li>Adresse email professionnelle</li>
        <li>Numéro de téléphone (optionnel)</li>
        <li>Nom de la structure (entreprise, cabinet)</li>
        <li>Contenu du message transmis (optionnel)</li>
      </ul>

      <h2>Finalité et base légale du traitement</h2>
      <p>
        Les données collectées via le formulaire sont utilisées aux fins suivantes,
        sur la base de l'<strong>intérêt légitime</strong> de ShadowPulse SAS
        (art. 6(1)(f) du RGPD) :
      </p>
      <ul>
        <li>Traiter votre demande de démonstration et vous recontacter ;</li>
        <li>Assurer un suivi commercial et, le cas échéant, vous adresser des
          communications relatives à nos offres (prospection commerciale B2B).</li>
      </ul>

      <h2>Durée de conservation</h2>
      <p>
        Les données collectées sont conservées pendant une durée maximale de
        <strong> 3 ans</strong> à compter du dernier contact, sauf obligation légale de
        conservation plus longue ou demande de suppression anticipée de votre part.
      </p>

      <h2>Vos droits</h2>
      <p>
        Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, de
        suppression et de portabilité de vos données, ainsi que d'un droit d'opposition
        et de limitation du traitement. Vous pouvez exercer ces droits à tout moment en
        écrivant à <a href="mailto:etude-cyber@shadowpulse.fr">etude-cyber@shadowpulse.fr</a>.
        Vous disposez également du droit d'introduire une réclamation auprès de la
        Commission Nationale de l'Informatique et des Libertés (CNIL).
      </p>
      <p>
        <strong>Droit d'opposition à la prospection commerciale :</strong> vous pouvez
        vous opposer à tout moment, sans justification et sans frais, à l'utilisation
        de vos données à des fins de prospection commerciale, en écrivant à{' '}
        <a href="mailto:etude-cyber@shadowpulse.fr">etude-cyber@shadowpulse.fr</a>.
        Cette opposition vaut pour l'ensemble des communications commerciales
        (art. 21(2) du RGPD).
      </p>

      <h2>Sous-traitants et destinataires</h2>
      <p>
        Les données saisies via le formulaire de contact sont transmises à{' '}
        <strong>Google LLC</strong> (1600 Amphitheatre Parkway, Mountain View, CA 94043,
        États-Unis) via le service <strong>Google Forms</strong>, utilisé comme outil
        de collecte et de stockage des réponses. Google LLC agit en qualité de
        sous-traitant au sens de l'article 28 du RGPD et traite ces données
        conformément à sa politique de confidentialité et aux clauses contractuelles
        types approuvées par la Commission européenne (transfert vers un pays tiers).
      </p>
      <p>
        Vos données ne sont ni cédées ni revendues à d'autres tiers. Pour toute
        information sur les garanties encadrant ce transfert, vous pouvez consulter
        la politique de confidentialité de Google à l'adresse{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
          policies.google.com/privacy
        </a>.
      </p>
      <p>
        Le site propose également un lien vers <strong>Calendly</strong> (Calendly Inc.,
        271 17th St NW, Atlanta, GA 30363, États-Unis) pour la prise de rendez-vous.
        Si vous utilisez ce service, vos données (nom, email, créneau choisi) sont
        traitées par Calendly Inc. conformément à sa propre politique de
        confidentialité. ShadowPulse SAS n'a pas accès à ces données et n'en est pas
        responsable de traitement au sens du RGPD.
      </p>

      <h2>Cookies</h2>
      <p>
        Ce site n'utilise actuellement aucun cookie de mesure d'audience ou de suivi
        publicitaire (pas de Google Analytics, pas de pixel Meta ou équivalent). Cette
        politique sera mise à jour si un outil de suivi venait à être installé.
      </p>

      <h2>Sécurité</h2>
      <p>
        ShadowPulse SAS met en œuvre les mesures techniques et organisationnelles
        raisonnables pour protéger les données collectées contre tout accès non
        autorisé, altération ou perte.
      </p>

      <h2>Modification de la présente politique</h2>
      <p>
        Cette politique de confidentialité peut être mise à jour à tout moment. La
        version en vigueur est celle publiée sur cette page.
      </p>
    </LegalLayout>
  )
}
