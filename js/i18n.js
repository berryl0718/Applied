// English / Bahasa Melayu.
//
// Every sentence on screen is written in English inside t("..."). When the
// visitor picks Bahasa Melayu, t() looks the English sentence up in MS below
// and returns the Malay version instead. If a sentence has no translation yet,
// the English one is shown, so the app never breaks. (tests/app.test.js checks
// that every sentence has a translation.)
//
// {name} in a sentence is a blank that t() fills in:
//   t("Due {date}", { date: "27 Oct" })  ->  "Due 27 Oct" / "Tamat 27 Okt"
//
// Only what people SEE is translated. Saved data (categories, plans, what users
// type) is stored the same way in both languages, so switching never changes it.
// No Supabase or web-page code in here, so the tests can use it too.
import { MS } from "./i18n-ms.js";

export const LANGS = ["en", "ms"];
export const LANG_NAMES = { en: "English", ms: "Bahasa Melayu" };
const STORAGE_KEY = "sme-lang";

function storedLang() {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    return LANGS.includes(saved) ? saved : "en";
  } catch {
    return "en"; // storage blocked (private window): use English
  }
}

let current = storedLang();

/** "en" or "ms". */
export const getLang = () => current;

/** Switch language. save: false only changes it for this page (the tests use that). */
export function setLang(lang, { save = true } = {}) {
  if (!LANGS.includes(lang)) return;
  current = lang;
  if (!save) return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  } catch { /* storage blocked: the choice lasts until the page reloads */ }
}

/** Translate an English sentence and fill in its {blanks}. */
export function t(text, vars = {}) {
  const sentence = current === "ms" && MS[text] ? MS[text] : text;
  return sentence.replace(/\{(\w+)\}/g, (blank, name) => (name in vars ? String(vars[name]) : blank));
}

/** "3 days" / "3 hari". Malay nouns don't change for plurals, so only English adds an "s". */
export function plural(n, word) {
  if (current === "ms") return `${n} ${t(word)}`;
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
