import { createContext, useContext } from 'react';

/**
 * English / Urdu UI strings. Urdu switches the document to right-to-left.
 * TODO: the Urdu copy below needs review by a native speaker before launch.
 */
export type Locale = 'en' | 'ur';

export const STRINGS = {
  menu: { en: 'Menu', ur: 'مینو' },
  close: { en: 'Close', ur: 'بند کریں' },
  contact: { en: 'Contact', ur: 'رابطہ' },
  bag: { en: 'Bag', ur: 'تھیلا' },
  range: { en: 'Range', ur: 'ذائقے' },
  benefits: { en: 'Benefits', ur: 'فوائد' },
  mix: { en: 'Mix a pack', ur: 'اپنا پیک بنائیں' },
  finder: { en: 'Find your flavor', ur: 'اپنا ذائقہ تلاش کریں' },
  halal: { en: 'Halal and Zamzam', ur: 'حلال اور زمزم' },
  stores: { en: 'Find a store', ur: 'دکان تلاش کریں' },
  faq: { en: 'FAQ', ur: 'سوالات' },
  newsletter: { en: 'Newsletter', ur: 'نیوز لیٹر' },
  language: { en: 'اردو', ur: 'English' },
  languageLabel: { en: 'Switch to Urdu', ur: 'Switch to English' },
  scroll: { en: 'Scroll to discover', ur: 'مزید دیکھنے کے لیے اسکرول کریں' },
  addToBag: { en: 'Add to bag', ur: 'تھیلے میں ڈالیں' },
  allFlavors: { en: 'All flavors', ur: 'تمام ذائقے' },
  tagline: { en: 'Fuel your wild side', ur: 'اپنے جنگلی پن کو توانائی دیں' },
  notFoundTitle: { en: 'Lost in the wild', ur: 'راستہ کھو گیا' },
  notFoundText: { en: 'This page doesn’t exist. Head back to the range.', ur: 'یہ صفحہ موجود نہیں۔ ذائقوں کی طرف واپس جائیں۔' },
  backHome: { en: 'Back to the range', ur: 'ذائقوں پر واپس جائیں' },
  shopTheRange: { en: 'Shop the range', ur: 'رینج خریدیں' },
  shopTitle: { en: 'Shop Grizzly Energy', ur: 'گرزلی انرجی خریدیں' },
  claims: { en: 'Six flavors · Halal certified · Made in Pakistan', ur: 'چھ ذائقے · حلال سرٹیفائیڈ · پاکستان میں تیار' },
  mixOwn: { en: 'Mix your own pack', ur: 'اپنا پیک خود بنائیں' },
  viewAndAdd: { en: 'View and add to bag', ur: 'دیکھیں اور تھیلے میں ڈالیں' },
} as const;

export type StringKey = keyof typeof STRINGS;

/** Flavor names in Urdu (TODO: native review). */
export const FLAVOR_NAMES_UR: Record<string, string> = {
  'blue-raspberry': 'بلو رسبری',
  'mango-fuego': 'مینگو فیوگو',
  watermelon: 'تربوز',
  'strawberry-kiwi': 'اسٹرابیری کیوی',
  peach: 'آڑو',
  'blackout-berry': 'بلیک آؤٹ بیری',
};

export const LOCALE_STORAGE_KEY = 'grizzly_locale';

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: StringKey) => string;
}

export const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', setLocale: () => {}, t: (key) => STRINGS[key].en });

export function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY) === 'ur' ? 'ur' : 'en';
  } catch {
    return 'en';
  }
}

export function useLocale() {
  return useContext(LocaleContext);
}
