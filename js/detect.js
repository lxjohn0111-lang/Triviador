import { getJSON } from './data.js';
// Country + language detection. Order: CrazyGames SDK geo -> timezone -> browser locale.
export const LANGS = {
  en: 'English', hu: 'Magyar', de: 'Deutsch', es: 'Español', fr: 'Français', it: 'Italiano',
  pt: 'Português', pl: 'Polski', tr: 'Türkçe', ru: 'Русский', nl: 'Nederlands', id: 'Bahasa Indonesia',
};
// Languages a country's players most plausibly want (first = default).
const COUNTRY_LANGS = {
  HU: ['hu'], DE: ['de'], AT: ['de'], CH: ['de', 'fr', 'it'], LI: ['de'], LU: ['fr', 'de'], BE: ['nl', 'fr', 'de'],
  ES: ['es'], MX: ['es'], AR: ['es'], CO: ['es'], CL: ['es'], PE: ['es'], VE: ['es'], EC: ['es'], GT: ['es'], CU: ['es'], BO: ['es'], DO: ['es'],
  HN: ['es'], PY: ['es'], SV: ['es'], NI: ['es'], CR: ['es'], PA: ['es'], UY: ['es'], PR: ['es'], GQ: ['es'],
  FR: ['fr'], MC: ['fr'], SN: ['fr'], CI: ['fr'], CM: ['fr'], CD: ['fr'], MG: ['fr'], ML: ['fr'], BF: ['fr'], NE: ['fr'], TG: ['fr'], BJ: ['fr'], GA: ['fr'], CG: ['fr'], HT: ['fr'], GN: ['fr'], TD: ['fr'],
  DZ: ['fr'], MA: ['fr'], TN: ['fr'],
  IT: ['it'], SM: ['it'], VA: ['it'],
  PT: ['pt'], BR: ['pt'], AO: ['pt'], MZ: ['pt'], CV: ['pt'], GW: ['pt'], ST: ['pt'], TL: ['pt'],
  PL: ['pl'], TR: ['tr'], CY: ['en', 'tr'],
  RU: ['ru'], BY: ['ru'], KZ: ['ru'], KG: ['ru'], UA: ['ru', 'en'], TJ: ['ru'], UZ: ['ru'], TM: ['ru'], AM: ['ru', 'en'], AZ: ['tr', 'ru'], MD: ['ru', 'en'],
  NL: ['nl'], SR: ['nl'], AW: ['nl'], CW: ['nl'],
  ID: ['id'], CA: ['en', 'fr'],
};

export function languageFor(cc, browserLangs = []) {
  const opts = COUNTRY_LANGS[cc] || ['en'];
  for (const bl of browserLangs) { const l = String(bl).slice(0, 2).toLowerCase(); if (opts.includes(l)) return l; }
  return opts[0];
}

export async function detectCountry(sdkInfo, has) {
  const ok = (cc) => (cc && has(cc.toUpperCase()) ? cc.toUpperCase() : null);
  let cc = ok(sdkInfo && sdkInfo.countryCode);
  if (cc) return { cc, source: 'sdk' };
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) { const map = await getJSON('data/tz.json'); cc = ok(map[tz]); if (cc) return { cc, source: 'timezone' }; }
  } catch (e) { /* ignore */ }
  for (const l of navigator.languages || [navigator.language || '']) {
    const m = /[-_]([A-Za-z]{2})\b/.exec(l); cc = ok(m && m[1]); if (cc) return { cc, source: 'locale' };
  }
  return { cc: 'US', source: 'default' };
}

export function countryName(cc, lang, fallback) {
  try { const n = new Intl.DisplayNames([lang], { type: 'region' }).of(cc); if (n && n !== cc) return n; } catch (e) { /* ignore */ }
  return fallback || cc;
}
export const flag = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
