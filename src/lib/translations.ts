export type Lang = 'el' | 'en'

type Dict = Record<string, { el: string; en: string }>

// Seed dictionary — expand as screens land.
const dict: Dict = {
  appName: { el: 'Company Fooding', en: 'Company Fooding' },
  login: { el: 'Σύνδεση', en: 'Log in' },
  logout: { el: 'Αποσύνδεση', en: 'Log out' },
  email: { el: 'Email', en: 'Email' },
  password: { el: 'Κωδικός', en: 'Password' },
  home: { el: 'Αρχική', en: 'Home' },
  admin: { el: 'Διαχειριστής', en: 'Admin' },
  company: { el: 'Εταιρεία', en: 'Company' },
  loading: { el: 'Φόρτωση…', en: 'Loading…' },
  notFound: { el: 'Δεν βρέθηκε', en: 'Not found' },
  employees: { el: 'Εργαζόμενοι', en: 'Employees' },
  benefits: { el: 'Παροχές', en: 'Benefits' },
  vendors: { el: 'Προμηθευτές', en: 'Vendors' },
  invoices: { el: 'Τιμολόγια', en: 'Invoices' },
  settings: { el: 'Ρυθμίσεις', en: 'Settings' },
}

export function makeTr(lang: Lang) {
  return (key: keyof typeof dict): string => dict[key]?.[lang] ?? String(key)
}
