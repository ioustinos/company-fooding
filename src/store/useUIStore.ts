import { create } from 'zustand'
import type { Lang } from '../lib/translations'

type UIState = {
  lang: Lang
  sidebarOpen: boolean
  setLang: (l: Lang) => void
  toggleSidebar: () => void
  setSidebar: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  lang: 'el',
  sidebarOpen: false,
  setLang: (l) => set({ lang: l }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar: (v) => set({ sidebarOpen: v }),
}))
