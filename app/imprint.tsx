import { LegalPage, type LegalClause } from '@/components/LegalPage';
import { OPERATOR } from '@/lib/legal';

const contact = [`Email: ${OPERATOR.email}`, ...(OPERATOR.phone ? [`Phone: ${OPERATOR.phone}`] : [])];

const CLAUSES: LegalClause[] = [
  {
    title: 'Service provider (§ 5 DDG)',
    paragraphs: [
      `${OPERATOR.company}\n${OPERATOR.street}\n${OPERATOR.city}\n${OPERATOR.country}`,
      `Represented by its managing director ${OPERATOR.director}`,
      `Registered at ${OPERATOR.register}`,
      ...(OPERATOR.vatId ? [`VAT ID (§ 27a UStG): ${OPERATOR.vatId}`] : []),
    ],
  },
  {
    title: 'Contact',
    paragraphs: contact,
  },
  {
    title: 'Responsible for content (§ 18 (2) MStV)',
    paragraphs: [`${OPERATOR.director}, ${OPERATOR.street}, ${OPERATOR.city}`],
  },
  {
    title: 'Point of contact under the Digital Services Act',
    paragraphs: [
      `Authorities, the European Commission, the European Board for Digital Services and users can reach us under Articles 11 and 12 of the Digital Services Act (EU) 2022/2065 at ${OPERATOR.email}. We answer in English and German.`,
      'To report illegal content on Cosurfing, use “Report” next to the review, photo, offer, tip or profile, or write to the address above.',
    ],
  },
  {
    title: 'Consumer dispute resolution',
    paragraphs: [
      'We are neither obliged nor willing to take part in dispute resolution proceedings before a consumer arbitration board (§ 36 VSBG).',
    ],
  },
];

export default function ImprintScreen() {
  return (
    <LegalPage
      title="Imprint"
      description="Imprint (Impressum) of Cosurfing (cosurfing.app), operated by Spacifik UG (haftungsbeschränkt), Berlin."
      clauses={CLAUSES}
    />
  );
}
