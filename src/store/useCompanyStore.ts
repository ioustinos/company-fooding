import { create } from 'zustand'

export type CompanyOption = { id: string; name: string }

type CompanyState = {
  companies: CompanyOption[]
  selectedId: string | null
  loaded: boolean
  setCompanies: (cs: CompanyOption[]) => void
  setSelected: (id: string) => void
}

// Holds the company-switcher state. For a super_admin this lists all companies
// and lets them view any one; for a company_admin it's just their own company.
export const useCompanyStore = create<CompanyState>((set) => ({
  companies: [],
  selectedId: null,
  loaded: false,
  setCompanies: (cs) =>
    set((s) => ({
      companies: cs,
      loaded: true,
      // keep current selection if still valid, else default to first
      selectedId:
        s.selectedId && cs.some((c) => c.id === s.selectedId)
          ? s.selectedId
          : (cs[0]?.id ?? null),
    })),
  setSelected: (id) => set({ selectedId: id }),
}))
