/** Operator data shared by the imprint, privacy policy, terms and emails. */
export const OPERATOR = {
  company: 'Spacifik UG (haftungsbeschränkt)',
  street: 'Gerichtstr. 19',
  city: '13347 Berlin',
  country: 'Germany',
  director: 'Luis Rieke',
  register: 'Amtsgericht Berlin-Charlottenburg, HRB 195740 B',
  /** Leave null unless the company has a VAT ID; § 5 DDG only requires it if one exists. */
  vatId: null as string | null,
  email: 'luis@cosurfing.app',
  /** § 5 DDG needs a second fast contact channel besides email; leave null to fall back to email only. */
  phone: null as string | null,
} as const;

export const OPERATOR_ADDRESS = `${OPERATOR.street}, ${OPERATOR.city}, ${OPERATOR.country}`;
