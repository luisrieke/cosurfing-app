import { LegalPage, type LegalClause } from '@/components/LegalPage';
import { OPERATOR, OPERATOR_ADDRESS } from '@/lib/legal';

const CLAUSES: LegalClause[] = [
  {
    title: 'Right of withdrawal',
    paragraphs: [
      'If you are a consumer, you have the right to withdraw from this contract within 14 days without giving any reason.',
      'The withdrawal period will expire after 14 days from the day of the conclusion of the contract.',
      `To exercise the right of withdrawal, you must inform us (${OPERATOR.company}, ${OPERATOR_ADDRESS}, email: ${OPERATOR.email}) of your decision to withdraw from this contract by an unequivocal statement (for example a letter sent by post or an email). You may use the model withdrawal form below, but it is not obligatory.`,
      'To meet the withdrawal deadline, it is sufficient for you to send your communication concerning your exercise of the right of withdrawal before the withdrawal period has expired.',
    ],
  },
  {
    title: 'Effects of withdrawal',
    paragraphs: [
      'If you withdraw from this contract, we shall reimburse to you all payments received from you without undue delay and in any event not later than 14 days from the day on which we are informed about your decision to withdraw from this contract. We will carry out such reimbursement using the same means of payment as you used for the initial transaction, unless you have expressly agreed otherwise; in any event, you will not incur any fees as a result of such reimbursement.',
      'If you requested to begin the performance of services during the withdrawal period, you shall pay us an amount which is in proportion to what has been provided until you have communicated to us your withdrawal from this contract, in comparison with the full coverage of the contract.',
    ],
  },
  {
    title: 'Purchases in the iOS or Android app',
    paragraphs: [
      'Subscriptions bought in the Cosurfing app are sold by Apple or Google. Withdrawals and refunds for these purchases are handled by Apple (reportaproblem.apple.com) or Google Play under their terms.',
    ],
  },
  {
    title: 'Model withdrawal form',
    paragraphs: [
      '(Complete and return this form only if you wish to withdraw from the contract.)',
      `To ${OPERATOR.company}, ${OPERATOR_ADDRESS}, email: ${OPERATOR.email}:`,
      'I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the provision of the following service (*): Cosurfing Plus',
      'Ordered on (*) / received on (*):',
      'Name of consumer(s):',
      'Address of consumer(s):',
      'Email address used for the Cosurfing account:',
      'Signature of consumer(s) (only if this form is notified on paper):',
      'Date:',
      '(*) Delete as appropriate.',
    ],
  },
];

export default function WithdrawalScreen() {
  return (
    <LegalPage
      title="Right of withdrawal"
      description="Right of withdrawal for Cosurfing Plus subscriptions bought on cosurfing.app, with the model withdrawal form."
      clauses={CLAUSES}
      contactLabel="Withdraw by email:"
    />
  );
}
