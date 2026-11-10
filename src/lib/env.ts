import { Platform } from 'react-native';

function read(name: string, value: string | undefined): string {
  return (value ?? '').trim();
}

export const env = {
  supabaseUrl: read('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: read('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  siteUrl:
    read('EXPO_PUBLIC_SITE_URL', process.env.EXPO_PUBLIC_SITE_URL) || 'https://cosurfing.app',
  showExamplePlaces:
    read('EXPO_PUBLIC_SHOW_EXAMPLE_PLACES', process.env.EXPO_PUBLIC_SHOW_EXAMPLE_PLACES) === 'true',
  revenueCatIosKey: read('EXPO_PUBLIC_REVENUECAT_IOS_KEY', process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
  revenueCatAndroidKey: read(
    'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  ),
  webPayments: read('EXPO_PUBLIC_WEB_PAYMENTS', process.env.EXPO_PUBLIC_WEB_PAYMENTS),
  plusWaitlistUrl: read('EXPO_PUBLIC_PLUS_WAITLIST_URL', process.env.EXPO_PUBLIC_PLUS_WAITLIST_URL),
  ownerFormUrl:
    read('EXPO_PUBLIC_OWNER_FORM_URL', process.env.EXPO_PUBLIC_OWNER_FORM_URL) || 'https://tally.so/r/o9Djeb',
  coffeeFormUrl: read('EXPO_PUBLIC_COFFEE_FORM_URL', process.env.EXPO_PUBLIC_COFFEE_FORM_URL),
};

// While set, the paywall sends people to this form instead of a checkout on every platform.
export const isPlusWaitlistEnabled = /^https:\/\//.test(env.plusWaitlistUrl);

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

export const isWebPaymentsConfigured = Platform.OS === 'web' && env.webPayments === 'stripe';

export const isNativePaymentsConfigured =
  (Platform.OS === 'ios' && Boolean(env.revenueCatIosKey)) ||
  (Platform.OS === 'android' && Boolean(env.revenueCatAndroidKey));

export const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
