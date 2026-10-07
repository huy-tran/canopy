// Coding fonts bundled with Canopy, so they work as terminal fonts without being installed.

export interface BundledFont {
  name: string
  provider: 'google' | 'fontsource'
}

export const TERM_FONTS: BundledFont[] = [
  { name: 'JetBrains Mono', provider: 'google' },
  { name: 'Cascadia Code', provider: 'fontsource' },
  { name: 'Fira Code', provider: 'google' },
  { name: 'Geist Mono', provider: 'google' },
  { name: 'IBM Plex Mono', provider: 'google' },
  { name: 'Source Code Pro', provider: 'google' },
  { name: 'Roboto Mono', provider: 'google' },
  { name: 'Ubuntu Mono', provider: 'google' },
  { name: 'Inconsolata', provider: 'google' },
  { name: 'Victor Mono', provider: 'google' },
  { name: 'Red Hat Mono', provider: 'google' },
]

/** Nerd Font icons (status line glyphs), bundled and placed after every terminal font so icons render with any of them. */
export const NERD_SYMBOLS = 'Symbols Nerd Font Mono'
