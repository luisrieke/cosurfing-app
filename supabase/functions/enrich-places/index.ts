// Reads the public website of crawled places and extracts hard facts that the venue states itself
// (day pass price, advertised internet speed, phone booths, laptop policy, 24/7 access, opening hours).
// Every fact is stored with the sentence it came from and the page URL, so the app can show its source.
// Respects robots.txt, only fetches public http(s) hosts, caps size and time per page.
// Parked (domain for sale) and dead websites are reported as such; save_web_facts hides those places for review.
// Called every 2 minutes by pg_cron (public.invoke_crawler). Deployed with verify_jwt = false.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_NAME = 'CosurfingBot';
const USER_AGENT = `${BOT_NAME}/1.0 (+https://cosurfing.app; luis@cosurfing.app)`;
const PAGE_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_000_000;
// Edge requests are cut off at 150 s: batches start until START_BUDGET_MS, each place is capped.
const START_BUDGET_MS = 60_000;
const PLACE_TIMEOUT_MS = 30_000;
const BATCH = 10;
const CONCURRENCY = 5;

// Sites that never contain venue facts we can read (or forbid scraping).
const SKIP_HOSTS =
  /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|twitter\.com|x\.com|tiktok\.com|linktr\.ee|wa\.me|whatsapp\.com|google\.[a-z.]+|goo\.gl|g\.page|maps\.app\.goo\.gl|tripadvisor\.[a-z.]+|yelp\.[a-z.]+|foursquare\.com|booking\.com|airbnb\.[a-z.]+|youtube\.com|line\.me|vk\.com|t\.me|ubereats\.com|deliveroo\.[a-z.]+|wolt\.com|grab\.com|linkedin\.com)$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Place {
  id: string;
  name: string;
  category: 'coworking' | 'cafe' | 'library' | 'coliving';
  website: string;
}

interface Fact<T = unknown> {
  value: T;
  snippet: string | null;
  url: string;
}

type Facts = Record<string, Fact>;

// ---------------------------------------------------------------------------
// Fetching (SSRF guard, robots.txt, size/time limits)
// ---------------------------------------------------------------------------

function isPrivateIp(ip: string): boolean {
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.)/.test(ip)) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:');
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('unsupported port');
  if (url.username || url.password) throw new Error('credentials in url');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) {
    throw new Error('private host');
  }
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) throw new Error('private host');
    return url;
  }
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(host, 'A').catch(() => [] as string[]),
      Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
    ]);
    if ([...a, ...aaaa].some(isPrivateIp)) throw new Error('private host');
  } catch (e) {
    if (e instanceof Error && e.message === 'private host') throw e;
  }
  return url;
}

interface Page {
  text: string;
  url: string;
  type: string;
}

/** Why a fetch failed. `dead` means the site is gone (no DNS, refused, 404/410, server error), not a hiccup. */
interface FetchFailure {
  failed: true;
  dead: boolean;
  reason: string;
  /** Final URL when the failure is an HTTP status. */
  url?: string;
}

const DEAD_STATUS = new Set([404, 410, 500, 502, 504, 521, 522, 523, 530]);
const DEAD_NETWORK = /dns error|failed to lookup|name or service not known|no such host|nodename nor servname|connection refused|no address associated/i;

function isFailure(r: Page | FetchFailure): r is FetchFailure {
  return 'failed' in r;
}

async function fetchText(raw: string, accept = 'text/html'): Promise<Page | FetchFailure> {
  let current = raw;
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    try {
      let res: Response;
      try {
        res = await fetch(url, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: `${accept},*/*;q=0.5`, 'Accept-Language': 'en,*;q=0.5' },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const dead = !controller.signal.aborted && DEAD_NETWORK.test(message) && !/temporary failure/i.test(message);
        return { failed: true, dead, reason: message.slice(0, 160) };
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, url).toString();
        await res.body?.cancel();
        continue;
      }
      if (!res.ok || !res.body) {
        await res.body?.cancel();
        return { failed: true, dead: DEAD_STATUS.has(res.status), reason: `http ${res.status}`, url: url.toString() };
      }
      const type = res.headers.get('content-type') ?? '';
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        chunks.push(value);
        if (size >= MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
      const buf = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        buf.set(c.subarray(0, Math.min(c.byteLength, size - offset)), offset);
        offset += c.byteLength;
        if (offset >= size) break;
      }
      return { text: new TextDecoder('utf-8', { fatal: false }).decode(buf), url: url.toString(), type };
    } finally {
      clearTimeout(timer);
    }
  }
  return { failed: true, dead: false, reason: 'too many redirects' };
}

const robotsCache = new Map<string, string[] | null>();

/** Disallow rules that apply to us (our own group, else the * group). Returns null when robots.txt is absent. */
async function robotsRules(origin: string): Promise<string[] | null> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  let rules: string[] | null = null;
  try {
    const res = await fetchText(`${origin}/robots.txt`, 'text/plain');
    if (!isFailure(res) && !/html/i.test(res.type)) {
      const groups = new Map<string, string[]>();
      let agents: string[] = [];
      let lastWasAgent = false;
      for (const line of res.text.split(/\r?\n/)) {
        const clean = line.replace(/#.*/, '').trim();
        const m = clean.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const key = m[1]!.toLowerCase();
        const value = m[2]!.trim();
        if (key === 'user-agent') {
          if (!lastWasAgent) agents = [];
          agents.push(value.toLowerCase());
          for (const a of agents) if (!groups.has(a)) groups.set(a, []);
          lastWasAgent = true;
        } else {
          lastWasAgent = false;
          if (key === 'disallow' && value) for (const a of agents) groups.get(a)?.push(value);
        }
      }
      rules = groups.get(BOT_NAME.toLowerCase()) ?? groups.get('*') ?? [];
    }
  } catch {
    rules = null;
  }
  robotsCache.set(origin, rules);
  return rules;
}

function allowedByRobots(rules: string[] | null, url: URL): boolean {
  if (!rules) return true;
  const path = url.pathname + url.search;
  return !rules.some((rule) => {
    const pattern = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const anchored = pattern.endsWith('\\$') ? `^${pattern.slice(0, -2)}$` : `^${pattern}`;
    try {
      return new RegExp(anchored).test(path);
    } catch {
      return path.startsWith(rule);
    }
  });
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&euro;/g, '€')
    .replace(/&pound;/g, '£')
    .replace(/&[nm]dash;/g, '–')
    .replace(/&[lr]squo;/g, "'")
    .replace(/&[lr]dquo;|&bdquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/&(auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/g, (_, e: string) =>
      ({ auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' })[e]!,
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<(br|p|div|li|h[1-6]|tr|section|article|td)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

function snippetAround(text: string, index: number, length: number): string {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  let start = Math.max(lineStart, index - 90);
  if (start > lineStart) start = text.indexOf(' ', start) + 1 || start;
  const nl = text.indexOf('\n', index + length);
  const lineEnd = nl === -1 ? text.length : nl;
  let end = Math.min(lineEnd, index + length + 90);
  if (end < lineEnd) end = Math.max(index + length, text.lastIndexOf(' ', end));
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 240);
  return `${start > lineStart ? '…' : ''}${body}${end < lineEnd ? '…' : ''}`;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']{10,600})["']|<meta[^>]+content=["']([^"']{10,600})["'][^>]*(?:name|property)=["']${name}["']`,
    'i',
  );
  const m = html.match(re);
  const value = m?.[1] ?? m?.[2];
  return value ? decodeEntities(value).trim() : null;
}

// Domain-sale and parking pages ("ChangeBox.org is for sale on Spaceship") answer with HTTP 200,
// so they have to be recognised by their content.
const PARKED_HOSTS =
  /(^|\.)(sedo\.com|sedoparking\.com|dan\.com|afternic\.com|hugedomains\.com|parkingcrew\.net|bodis\.com|above\.com|domainmarket\.com|undeveloped\.com|buydomains\.com|uniregistry\.com|parklogic\.com|spaceship\.com|atom\.com|squadhelp\.com|domainlander\.com|epik\.com)$/i;
const PARKED_PHRASES = new RegExp(
  [
    String.raw`\b[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2})?\s+is\s+(?:now\s+)?for\s+sale\b`,
    String.raw`\b(?:this|the)\s+domain(?:\s+name)?(?:\s+[a-z0-9.-]+)?\s+(?:is|may\s+be|might\s+be)\s+(?:for\s+sale|available\s+for\s+(?:sale|purchase))`,
    String.raw`\bbuy\s+this\s+domain\b`,
    String.raw`\bmake\s+an\s+offer\s+on\s+this\s+domain\b`,
    String.raw`\bdomain\s+(?:name\s+)?parking\b`,
    String.raw`\bparked\s+(?:free|domain)\b`,
    String.raw`\bthis\s+domain\s+(?:has\s+)?expired\b`,
    String.raw`\bdiese\s+domain\s+(?:steht\s+zum\s+verkauf|kann\s+(?:erworben|gekauft)\s+werden|ist\s+(?:zu\s+verkaufen|abgelaufen))`,
    String.raw`\bdomain\s+kaufen\b`,
    String.raw`\bce\s+(?:nom\s+de\s+)?domaine\s+est\s+[àa]\s+vendre\b`,
    String.raw`\beste\s+dominio\s+est[áa]\s+a\s+la\s+venta\b`,
  ].join('|'),
  'i',
);
const PARKED_MARKERS =
  /(sedoparking|parkingcrew|bodis\.com|dan\.com\/|afternic|hugedomains|domainmarket|parklogic|window\.park\s*=|\/lander\b|spaceship\.com\/[^"']*(?:domain|sale|lander))/i;

function classifyParked(html: string, finalUrl: string): boolean {
  if (PARKED_HOSTS.test(new URL(finalUrl).hostname)) return true;
  const title = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? '';
  const description = metaContent(html, 'description') ?? metaContent(html, 'og:description') ?? '';
  const text = htmlToText(html);
  if (PARKED_PHRASES.test(`${decodeEntities(title)}\n${description}\n${text.slice(0, 5000)}`)) return true;
  // Parking scripts on a page that has hardly any own content.
  return text.length < 4000 && PARKED_MARKERS.test(html);
}

// Many CMSs answer missing pages with HTTP 200 and a "page not found" template.
const NOT_FOUND_PHRASES =
  /(\b404\b|page (?:was )?not found|page (?:cannot|can't|could not) be found|page (?:does not|doesn't) exist|nicht gefunden|seite existiert nicht|page introuvable|page non trouv[ée]e|p[áa]gina no encontrada|p[áa]gina n[ãa]o encontrada|pagina non trovata|pagina niet gevonden|niet gevonden|nie znaleziono|sayfa bulunamad[ıi])/i;

function looksNotFound(html: string): boolean {
  const title = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? '';
  const h1 = html.match(/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '';
  return NOT_FOUND_PHRASES.test(decodeEntities(`${title}\n${h1}`));
}

async function fetchPage(raw: string): Promise<Page | FetchFailure> {
  const page = await fetchText(raw);
  if (!isFailure(page) && /html/i.test(page.type || 'text/html') && looksNotFound(page.text)) {
    return { failed: true, dead: true, reason: 'not found page', url: page.url };
  }
  return page;
}

function jsonLdNodes(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(m[1]!.trim());
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        out.push(node as Record<string, unknown>);
        const graph = (node as Record<string, unknown>)['@graph'];
        if (Array.isArray(graph)) stack.push(...graph);
      }
    } catch {
      // invalid JSON-LD is common; ignore it
    }
  }
  return out;
}

const DAY_MAP: Record<string, string> = {
  monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th', friday: 'Fr', saturday: 'Sa', sunday: 'Su',
};

/** Converts schema.org opening hours to the OSM opening_hours syntax used in the app. */
function openingHoursFromLd(node: Record<string, unknown>): string | null {
  const oh = node.openingHours;
  if (typeof oh === 'string' && /^[A-Za-z,\- ]+\s\d{1,2}:\d{2}-\d{1,2}:\d{2}/.test(oh)) return oh.trim();
  if (Array.isArray(oh) && oh.every((x) => typeof x === 'string')) {
    const joined = (oh as string[]).map((x) => x.trim()).join('; ');
    if (/\d{1,2}:\d{2}-\d{1,2}:\d{2}/.test(joined)) return joined;
  }
  const spec = node.openingHoursSpecification;
  if (Array.isArray(spec)) {
    const parts: string[] = [];
    for (const s of spec as Record<string, unknown>[]) {
      const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek])
        .map((d) => (typeof d === 'string' ? DAY_MAP[d.split('/').pop()!.toLowerCase()] : undefined))
        .filter(Boolean);
      const opens = typeof s.opens === 'string' ? s.opens.slice(0, 5) : null;
      const closes = typeof s.closes === 'string' ? s.closes.slice(0, 5) : null;
      // "09:30-06:00" is almost always a 12h clock mistake on the site; skip instead of guessing.
      if (opens && closes && closes < opens && closes > '03:00') continue;
      if (days.length && opens && closes) parts.push(`${days.join(',')} ${opens}-${closes}`);
    }
    if (parts.length) return parts.join('; ');
  }
  return null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR', '$': 'USD', '£': 'GBP', '฿': 'THB', '₫': 'VND', '₹': 'INR', '¥': 'JPY', '₩': 'KRW', 'R$': 'BRL', 'zł': 'PLN', '₺': 'TRY', '₱': 'PHP', 'kr': 'SEK',
};
const CURRENCY = String.raw`(R\$|€|\$|£|฿|₫|₹|¥|₩|zł|₺|₱|EUR|USD|GBP|THB|IDR|VND|MXN|COP|ARS|BRL|PEN|CLP|CHF|CZK|PLN|HUF|RON|BGN|TRY|GEL|ZAR|MYR|SGD|AUD|NZD|CAD|JPY|KRW|INR|PHP|SEK|NOK|DKK|AED|MAD|EGP|Rp|RM|kr)`;
const AMOUNT = String.raw`(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const DAY_PASS_WORDS = String.raw`(day[\s-]?pass|daily pass|day ticket|1[\s-]day|one[\s-]day|full day|tagespass|tageskarte|tagesticket|tagesplatz|pase (?:de |por )?d[ií]a|d[ií]a completo|tarifa diaria|passe? (?:à la )?journ[ée]e?|journ[ée]e compl[eè]te|di[áa]ria|passe di[áa]rio|giornaliero|dagpas|dagkaart|dzienny|denní|ημερήσιο|hot[\s-]?desk(?:ing)? (?:day|per day|daily))`;

function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normCurrency(raw: string): string {
  const r = raw.trim();
  if (CURRENCY_SYMBOLS[r]) return CURRENCY_SYMBOLS[r]!;
  if (r === 'Rp') return 'IDR';
  if (r === 'RM') return 'MYR';
  return r.toUpperCase();
}

function findDayPass(text: string, url: string): Fact<{ amount: number; currency: string }> | null {
  const patterns = [
    new RegExp(`${DAY_PASS_WORDS}[^\\n]{0,60}?${CURRENCY}\\s?${AMOUNT}`, 'i'),
    new RegExp(`${DAY_PASS_WORDS}[^\\n]{0,60}?${AMOUNT}\\s?${CURRENCY}`, 'i'),
    new RegExp(`${CURRENCY}\\s?${AMOUNT}[^\\n]{0,25}?(?:/|per|pro|por|par)\\s?(?:day|tag|d[ií]a|jour|dia|giorno)\\b`, 'i'),
    new RegExp(`${AMOUNT}\\s?${CURRENCY}[^\\n]{0,25}?(?:/|per|pro|por|par)\\s?(?:day|tag|d[ií]a|jour|dia|giorno)\\b`, 'i'),
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i]!);
    if (!m || m.index === undefined) continue;
    const groups = m.slice(1).filter((g) => g !== undefined);
    // patterns 0/1 start with the day-pass words group
    const rest = i < 2 ? groups.slice(1) : groups;
    const [a, b] = rest;
    const currencyFirst = i === 0 || i === 2;
    const amount = parseAmount(currencyFirst ? b! : a!);
    const currency = normCurrency(currencyFirst ? a! : b!);
    if (!amount) continue;
    const context = text.slice(Math.max(0, m.index - 100), m.index + m[0].length + 60).toLowerCase();
    // Day rates for meeting rooms or events are not desk day passes.
    if (/(meeting|tagung|tagen|konferenz|conference|event|seminar|reuni|r[ée]union|riunion|workshop)/.test(context)) continue;
    // "1 day a week £150" or "€90 per month" are memberships, not day passes.
    const around = text.slice(m.index, m.index + m[0].length + 25).toLowerCase();
    if (/(week|month|woche|monat|semana|mes\b|mois|settiman|mese|weekly|monthly|monatlich|mensual|mensuel|mensile|mensal)/.test(around)) continue;
    // Generic "price per day" (no day-pass wording) must be about a desk.
    if (i >= 2 && !/(desk|coworking|co-working|arbeitsplatz|schreibtisch|flex|puesto|escritorio|poste|postazione|mesa)/.test(context)) continue;
    // Plausibility: a day pass is not 0.5 € and not a monthly membership.
    if (currency === 'EUR' || currency === 'USD' || currency === 'GBP' || currency === 'CHF') {
      if (amount < 3 || amount > 150) continue;
    }
    return { value: { amount, currency }, snippet: snippetAround(text, m.index, m[0].length), url };
  }
  return null;
}

function findMbps(text: string, url: string): Fact<number> | null {
  // "200/20 Mbps" is download/upload: the leading number is the download speed.
  const re = /(?:(\d{1,5})\s?\/\s?)?(\d{1,2}[.,]?\d{0,3}|\d{2,5})\s?(gbit\/s|gbps|gbit|mbit\/s|mbps|mb\/s|mbit|megabit)/gi;
  let best: { value: number; index: number; len: number } | null = null;
  for (const m of text.matchAll(re)) {
    let value = Number((m[1] ?? m[2]!).replace(',', '.'));
    if (/^g/i.test(m[3]!)) value *= 1000;
    if (!Number.isFinite(value) || value < 5 || value > 10_000) continue;
    const context = text.slice(Math.max(0, m.index! - 80), m.index! + 80).toLowerCase();
    if (!/(wi-?fi|wlan|internet|fiber|fibre|glasfaser|fibra|connection|verbindung|conexi|broadband|speed|velocidad|geschwindigkeit|upload|download)/.test(context)) continue;
    if (!best || value > best.value) best = { value, index: m.index!, len: m[0].length };
  }
  return best ? { value: Math.round(best.value), snippet: snippetAround(text, best.index, best.len), url } : null;
}

function findFlag(text: string, re: RegExp, url: string): Fact<true> | null {
  const m = text.match(re);
  return m && m.index !== undefined ? { value: true, snippet: snippetAround(text, m.index, m[0].length), url } : null;
}

const RE_PHONE_BOOTH = /(phone[\s-]?booths?|call[\s-]?booths?|phone[\s-]?(?:room|pod)s?|skype[\s-]?rooms?|focus[\s-]?pods?|telefon(?:box|kabine|zelle)n?|cabinas? telef[óo]nicas?|cabines? t[ée]l[ée]phoniques?|cabine telefoniche)/i;
const RE_MEETING = /(meeting[\s-]?rooms?|conference[\s-]?rooms?|besprechungsr[äa]ume?|konferenzr[äa]ume?|meetingr[äa]ume?|salas? de reuni(?:ón|ones)|salles? de r[ée]union|sale riunioni|salas? de reuni[ãa]o)/i;
const RE_24_7 =
  /((?:24\/7|24 ?h(?:ours|rs)?|24 horas|24h\/24|rund um die uhr)[\s-]*(?:access|zugang|zugriff|acesso|acceso|accès|accesso|open|ge[öo]ffnet|aberto|abierto|ouvert|aperto)|(?:access|zugang|zugriff|acesso|acceso|accès|accesso|open|ge[öo]ffnet|aberto|abierto|ouvert|aperto)[\s:-]*(?:24\/7|24 ?h(?:ours)?|24 horas|rund um die uhr))/i;
const RE_WIFI = /(free wi-?fi|kostenlose[sr]? (?:wlan|wi-?fi)|gratis (?:wlan|wi-?fi)|wi-?fi gratis|wi-?fi gratuit|wi-?fi grátis|fast wi-?fi|high[\s-]speed (?:wi-?fi|internet)|wi-?fi)/i;
const RE_NO_LAPTOP = /(no[\s-]laptops?|laptop[\s-]free|keine laptops|laptops? (?:are )?not (?:allowed|permitted)|sin port[áa]tiles|pas d'ordinateurs?|laptops? (?:verboten|nicht erlaubt))/i;
const RE_LAPTOP_OK = /(laptop[\s-]friendly|laptops? (?:are )?welcome|work[\s-]friendly|remote[\s-]work(?:er)?s? (?:welcome|friendly)|digital nomads? (?:welcome|friendly)|laptopfreundlich)/i;

function extractFacts(html: string, url: string, category: Place['category']): Facts {
  const facts: Facts = {};
  const text = htmlToText(html);
  const ld = jsonLdNodes(html);

  for (const node of ld) {
    if (!facts.opening_hours) {
      const oh = openingHoursFromLd(node);
      if (oh) facts.opening_hours = { value: oh.slice(0, 300), snippet: null, url };
    }
    if (!facts.price_range && typeof node.priceRange === 'string' && node.priceRange.length <= 20) {
      facts.price_range = { value: node.priceRange, snippet: null, url };
    }
  }

  const description = metaContent(html, 'description') ?? metaContent(html, 'og:description');
  if (description) facts.description = { value: description.slice(0, 300), snippet: null, url };

  if (category === 'coworking') {
    const dayPass = findDayPass(text, url);
    if (dayPass) facts.day_pass = dayPass;
  }
  const mbps = findMbps(text, url);
  if (mbps) facts.advertised_mbps = mbps;

  const phone = findFlag(text, RE_PHONE_BOOTH, url);
  if (phone) facts.phone_booths = phone;
  const meeting = findFlag(text, RE_MEETING, url);
  if (meeting) facts.meeting_rooms = meeting;
  const always = findFlag(text, RE_24_7, url);
  if (always) facts.open_24_7 = always;
  const wifi = findFlag(text, RE_WIFI, url);
  if (wifi) facts.wifi_mentioned = wifi;

  if (category === 'cafe') {
    const no = text.match(RE_NO_LAPTOP);
    const ok = text.match(RE_LAPTOP_OK);
    const m = no ?? ok;
    if (m && m.index !== undefined) {
      facts.laptops = { value: no ? 'not_allowed' : 'welcome', snippet: snippetAround(text, m.index, m[0].length), url };
    }
  }
  return facts;
}

const PRICING_LINK = /(pric|preise|tarif|membership|mitglied|plans|planes|precios|prezzi|pre[çc]os|rates|day-?pass|tagespass|hot-?desk|coworking)/i;

function findPricingLink(html: string, base: URL): string | null {
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = m[1]!;
    const label = m[2]!.replace(/<[^>]+>/g, ' ');
    if (!PRICING_LINK.test(href) && !PRICING_LINK.test(label)) continue;
    try {
      const u = new URL(href, base);
      if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
      if (!/^https?:$/.test(u.protocol) || /\.(pdf|jpg|png|zip)$/i.test(u.pathname)) continue;
      if (u.pathname === base.pathname) continue;
      return u.toString();
    } catch {
      // ignore malformed links
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Job loop
// ---------------------------------------------------------------------------

async function enrichOne(sb: SupabaseClient, place: Place): Promise<{ id: string; status: string; facts?: string[]; error?: string }> {
  let status: 'done' | 'failed' | 'blocked' | 'skipped' | 'parked' | 'dead' = 'failed';
  let facts: Facts = {};
  let error: string | undefined;
  let workingUrl: string | null = null;
  let timer: number | undefined;
  try {
    await Promise.race([
      readSite(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), PLACE_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    status = 'failed';
    facts = {};
    error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
  } finally {
    clearTimeout(timer);
  }
  if (status !== 'done') workingUrl = null;
  if (status === 'done') facts._checked = { value: new Date().toISOString(), snippet: null, url: workingUrl ?? place.website };
  const { error: saveError } = await sb.rpc('save_web_facts', {
    p_place_id: place.id,
    p_status: status,
    p_facts: facts,
    p_website: workingUrl,
  });
  if (saveError) return { id: place.id, status: 'save_failed', error: saveError.message };
  return { id: place.id, status, facts: Object.keys(facts).filter((k) => k !== '_checked'), error };

  async function readSite() {
    const url = new URL(place.website);
    if (SKIP_HOSTS.test(url.hostname)) {
      status = 'skipped';
    } else {
      const rules = await robotsRules(url.origin);
      if (!allowedByRobots(rules, url)) {
        status = 'blocked';
      } else {
        let page = await fetchPage(url.toString());
        // A moved subpage is not a dead venue: retry the homepage and link to it instead.
        if (isFailure(page) && page.dead && (url.pathname !== '/' || url.search) && /^(http 4|not found page)/.test(page.reason)) {
          const home = await fetchPage(url.origin + '/');
          if (!isFailure(home)) workingUrl = url.origin + '/';
          if (!isFailure(home) || !home.dead) page = home;
        }
        if (isFailure(page)) {
          status = page.dead ? 'dead' : 'failed';
          error = page.reason;
        } else if (!/html|xml/i.test(page.type || 'text/html')) {
          status = 'failed';
          error = 'no html';
        } else if (classifyParked(page.text, page.url)) {
          status = 'parked';
          error = `parked: ${new URL(page.url).hostname}`;
        } else {
          facts = extractFacts(page.text, page.url, place.category);
          if (place.category === 'coworking' && (!facts.day_pass || !facts.advertised_mbps)) {
            const link = findPricingLink(page.text, new URL(page.url));
            if (link && allowedByRobots(rules, new URL(link))) {
              const sub = await fetchText(link).catch(() => null);
              if (sub && !isFailure(sub) && /html/i.test(sub.type || 'text/html')) {
                const more = extractFacts(sub.text, sub.url, place.category);
                for (const [k, v] of Object.entries(more)) if (!facts[k] && k !== 'description') facts[k] = v;
              }
            }
          }
          status = 'done';
        }
      }
    }
  }
}

async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const secret = req.headers.get('x-crawler-secret') ?? '';
  const { data: ok } = await sb.rpc('check_crawler_secret', { p_secret: secret });
  if (!secret || ok !== true) return json({ error: 'unauthorized' }, 401);

  const started = Date.now();
  const results: Awaited<ReturnType<typeof enrichOne>>[] = [];
  while (Date.now() - started < START_BUDGET_MS) {
    const { data, error } = await sb.rpc('claim_enrich_batch', { p_limit: BATCH });
    if (error) return json({ error: error.message, results }, 500);
    const places = (data as Place[] | null) ?? [];
    if (!places.length) break;
    results.push(...(await runPool(places, CONCURRENCY, (p) => enrichOne(sb, p))));
  }
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return json({ ok: true, processed: results.length, ms: Date.now() - started, counts, results });
});
