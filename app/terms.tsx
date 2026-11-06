import Head from 'expo-router/head';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader, SiteHeaderSpacer } from '@/components/SiteHeader';
import { Glass, Icon, Text } from '@/components/ui';
import { TERMS_UPDATED } from '@/lib/terms';
import { colors, layout, radius, spacing } from '@/lib/theme';

const CONTACT = 'luis@cosurfing.app';

/** Plain-language summary; the clauses below are what counts. */
const SUMMARY = [
  'Cosurfing is run by Spacifik UG (haftungsbeschränkt) in Berlin.',
  'Photos, reviews, ratings and suggestions you submit: you give Spacifik UG the exclusive, unlimited and free right to use them for any purpose, including commercially. You cannot license your submitted photos to anyone else.',
  'Only upload photos you took yourself, without recognizable people.',
  'Your profile picture and name stay yours.',
  'Place information can be wrong or outdated. Check important details with the venue.',
];

interface Clause {
  title: string;
  paragraphs: string[];
}

const CLAUSES: Clause[] = [
  {
    title: '1. Operator and scope',
    paragraphs: [
      'cosurfing.app and the Cosurfing apps (together “Cosurfing”) are operated by Spacifik UG (haftungsbeschränkt), Gerichtstr. 19, 13347 Berlin, Germany, registered at Amtsgericht Berlin-Charlottenburg under HRB 195740 B, represented by its managing director Luis Rieke (“Spacifik”, “we”, “us”).',
      'These Terms of Use apply to every use of Cosurfing, with or without an account. By creating an account, signing in or submitting any content you accept these Terms.',
    ],
  },
  {
    title: '2. The service',
    paragraphs: [
      'Cosurfing helps people find places to work remotely: coworking spaces, cafés and libraries. Place information comes from OpenStreetMap (© OpenStreetMap contributors, ODbL), from the venues’ own websites, from our editors and from users.',
      'We do our best to keep the information correct, but places open, close and change. We do not guarantee that any information (including opening hours, prices, Wi‑Fi speed, or whether a place still exists) is correct, complete or up to date. Please check important details with the venue directly.',
    ],
  },
  {
    title: '3. Accounts',
    paragraphs: [
      'You need an account to write reviews, run speed tests, upload photos, suggest places and report issues. You must be at least 16 years old. Keep access to your email address secure; you are responsible for activity under your account.',
      'We may suspend or delete accounts that break these Terms, post abusive or misleading content, or try to manipulate rankings.',
    ],
  },
  {
    title: '4. Your content and the rights you grant us',
    paragraphs: [
      '“Your content” means everything you submit to Cosurfing: photos (whether added on a place page or together with a review), written reviews, star and detail ratings, facts about a place, speed test results, place suggestions, reports, corrections and any other text or media. Your profile picture and display name are not “your content” in this sense; see the last paragraph of this section.',
      'Under German copyright law the copyright itself (Urheberrecht) cannot be transferred. By submitting your content you therefore grant Spacifik UG (haftungsbeschränkt), as operator of Cosurfing, an exclusive, unlimited, perpetual, irrevocable, worldwide, royalty-free, transferable and sublicensable right to use your content in any form and for any purpose, for all types of use known now or in the future (§ 31 UrhG). This includes in particular the right to reproduce, distribute, publicly display and make available, edit, adapt, translate, crop, combine with other works, and use your content commercially, including in advertising, in other products and services of Spacifik UG, and by passing it on to partners and licensees.',
      'Because the right of use is exclusive, you may not license, sell or publish photos you submitted to Cosurfing to or with third parties (for example stock photo sites, review platforms or other apps). You receive no payment for your content; contributor points are not a payment and have no monetary value.',
      'You accept these Terms, including the rights in this section, when you create your account, and you grant these rights each time you submit content. We store the time and the version of these Terms with your account and with your content.',
      'To the extent permitted by law, you waive your right to be named as the author (§ 13 UrhG). We may show your display name next to your content, but we are not obliged to.',
      'Deleting your account or your review does not end the rights granted above. We may keep using content that you submitted, without your name.',
      'Your profile picture and display name stay yours. You only grant us a simple (non-exclusive), free right to show them in Cosurfing next to your contributions for as long as your account exists.',
    ],
  },
  {
    title: '5. Rules for your content',
    paragraphs: [
      'You confirm that you created your content yourself and that you hold all rights needed to grant the rights in section 4. Photos must have been taken by you.',
      'Photos must not show recognizable people, licence plates, private documents or screens with private content. Content must be accurate to the best of your knowledge and must not be illegal, offensive, discriminatory, advertising, or written in exchange for any benefit from the venue or a competitor.',
      'You indemnify Spacifik UG against all third-party claims (including reasonable legal costs) that arise because your content infringes the rights of others or breaks these Terms.',
      'We may review, edit, refuse, hide or delete any content at any time and are not obliged to publish it. Photos are published only after review.',
    ],
  },
  {
    title: '6. Cosurfing Plus',
    paragraphs: [
      'Cosurfing Plus is a paid subscription that unlocks additional content. Purchases in the iOS or Android app are handled by Apple or Google under their terms; purchases on the web are processed by Stripe. Prices, billing period and cancellation are shown before you buy. Statutory rights of withdrawal for consumers remain unaffected.',
    ],
  },
  {
    title: '7. Acceptable use',
    paragraphs: [
      'Do not scrape, copy or systematically extract data from Cosurfing, interfere with the service, create fake accounts, or try to manipulate reviews, speed tests or rankings.',
    ],
  },
  {
    title: '8. Liability',
    paragraphs: [
      'We are liable without limitation for intent and gross negligence, for injury to life, body or health, and under the German Product Liability Act. For slight negligence we are only liable for breaches of essential contractual obligations (obligations whose fulfilment makes the proper use of the service possible in the first place and on which you may regularly rely), limited to the typical, foreseeable damage. Otherwise our liability is excluded.',
      'Free features are provided as they are. We may change, restrict or discontinue features at any time.',
    ],
  },
  {
    title: '9. Changes to these Terms',
    paragraphs: [
      'We may update these Terms. We will tell signed-in users about material changes in the app or by email. If you keep using Cosurfing after a change takes effect, the new Terms apply. The rights you have already granted for submitted content stay in place.',
    ],
  },
  {
    title: '10. Governing law',
    paragraphs: [
      'German law applies, excluding the UN Convention on Contracts for the International Sale of Goods. If you are a consumer, mandatory consumer protection rules of the country where you live remain unaffected. If you are a merchant, the place of jurisdiction is Berlin. If any provision is invalid, the rest of these Terms remain valid.',
    ],
  },
];

export default function TermsScreen() {
  return (
    <View style={styles.root}>
      <Head>
        <title>Terms of Use · Cosurfing</title>
        <meta name="description" content="Terms of Use of Cosurfing (cosurfing.app), operated by Spacifik UG (haftungsbeschränkt)." />
      </Head>
      <SiteHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <SiteHeaderSpacer />
        <View style={styles.page}>
          <View style={styles.intro}>
            <Text variant="title">Terms of Use</Text>
            <Text variant="small" tone="muted">
              Last updated {TERMS_UPDATED}
            </Text>
          </View>
          <Glass variant="strong" style={styles.summary}>
            <Text variant="bodyStrong">In short</Text>
            {SUMMARY.map((s) => (
              <View key={s.slice(0, 40)} style={styles.summaryRow}>
                <Icon name="check" size={16} color={colors.accent} />
                <Text variant="small" style={styles.flex}>
                  {s}
                </Text>
              </View>
            ))}
          </Glass>
          {CLAUSES.map((c) => (
            <View key={c.title} style={styles.clause}>
              <Text variant="bodyStrong">{c.title}</Text>
              {c.paragraphs.map((p) => (
                <Text key={p.slice(0, 40)}>{p}</Text>
              ))}
            </View>
          ))}
          <View style={styles.clause}>
            <Text variant="bodyStrong">Contact</Text>
            <Text>
              Questions about these Terms or a request to remove content:{' '}
              <Text tone="accent" onPress={() => void Linking.openURL(`mailto:${CONTACT}`)} accessibilityRole="link">
                {CONTACT}
              </Text>
            </Text>
          </View>
        </View>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    alignItems: 'center',
    paddingBottom: 64,
  },
  page: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },
  intro: {
    gap: spacing.xs,
  },
  clause: {
    gap: spacing.sm,
  },
  summary: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
