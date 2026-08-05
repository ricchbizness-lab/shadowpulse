import React from 'react'
import LegalLayout from '../components/LegalLayout.jsx'

export default function MentionsLegales() {
  return (
    <LegalLayout title="Mentions légales">
      <h2>Éditeur du site</h2>
      <p>
        Le site <strong>shadowpulse.fr</strong> (et son alias GitHub Pages
        ricchbizness-lab.github.io/shadowpulse) est édité par :
      </p>
      <ul>
        <li><strong>Raison sociale :</strong> ShadowPulse SAS</li>
        <li><strong>Forme juridique :</strong> Société par actions simplifiée (SAS)</li>
        <li><strong>Siège social :</strong> 66 Avenue des Champs-Élysées, 75008 Paris, France</li>
        <li><strong>SIRET :</strong> <span className="legal-placeholder">[À COMPLÉTER]</span></li>
        <li><strong>Contact :</strong> <a href="mailto:contact@shadowpulse.fr">contact@shadowpulse.fr</a></li>
      </ul>

      <h2>Directeur de la publication</h2>
      <p>
        <span className="legal-placeholder">[À COMPLÉTER]</span>
      </p>

      <h2>Hébergement</h2>
      <p>Le site est hébergé par :</p>
      <ul>
        <li><strong>Hébergeur :</strong> GitHub Pages — GitHub Inc.</li>
        <li><strong>Adresse :</strong> 88 Colin P Kelly Jr St, San Francisco, CA 94107, États-Unis</li>
      </ul>

      <h2>Propriété intellectuelle</h2>
      <p>
        L'ensemble des éléments présents sur ce site (textes, graphismes, logo, icônes,
        structure, mise en page) est la propriété exclusive de ShadowPulse SAS, sauf
        mention contraire, et est protégé par le droit français et international relatif
        à la propriété intellectuelle. Toute reproduction, représentation, modification,
        publication ou adaptation de tout ou partie des éléments du site, quel que soit
        le moyen ou le procédé utilisé, est interdite sans autorisation écrite préalable
        de ShadowPulse SAS.
      </p>

      <h2>Limitation de responsabilité</h2>
      <p>
        ShadowPulse SAS s'efforce d'assurer l'exactitude et la mise à jour des
        informations diffusées sur ce site, mais ne saurait garantir l'exhaustivité,
        l'exactitude ou l'actualité de ces informations. ShadowPulse SAS ne pourra être
        tenue responsable des dommages directs ou indirects résultant de l'accès au site
        ou de l'impossibilité d'y accéder, ni de l'utilisation qui en est faite.
      </p>
      <p>
        Le site peut contenir des liens vers des sites tiers (par exemple Calendly).
        ShadowPulse SAS n'exerce aucun contrôle sur ces sites et décline toute
        responsabilité quant à leur contenu.
      </p>

      <h2>Droit applicable</h2>
      <p>
        Les présentes mentions légales sont soumises au droit français. En cas de
        litige, et à défaut de résolution amiable, les tribunaux compétents de Paris
        seront seuls compétents.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative aux présentes mentions légales, vous pouvez nous
        écrire à <a href="mailto:contact@shadowpulse.fr">contact@shadowpulse.fr</a>.
      </p>
    </LegalLayout>
  )
}
