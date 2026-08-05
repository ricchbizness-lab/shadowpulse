import React from 'react'
import LegalLayout from '../components/LegalLayout.jsx'

export default function PolitiqueConfidentialite() {
  return (
    <LegalLayout title="Politique de confidentialité">
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
        Contact : <a href="mailto:contact@shadowpulse.fr">contact@shadowpulse.fr</a>.
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

      <h2>Finalité du traitement</h2>
      <p>Les données collectées via le formulaire sont utilisées pour :</p>
      <ul>
        <li>Traiter votre demande de démonstration et vous recontacter ;</li>
        <li>Assurer un suivi commercial et, le cas échéant, vous adresser des
          communications relatives à nos offres (prospection commerciale).</li>
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
        écrivant à <a href="mailto:contact@shadowpulse.fr">contact@shadowpulse.fr</a>.
        Vous disposez également du droit d'introduire une réclamation auprès de la
        Commission Nationale de l'Informatique et des Libertés (CNIL).
      </p>

      <h2>Transfert des données</h2>
      <p>
        Vos données ne font l'objet d'aucun transfert hors de l'Union européenne et ne
        sont ni cédées ni revendues à des tiers.
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
