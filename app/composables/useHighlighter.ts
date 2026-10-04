// Shiki syntax highlighting, line by line, coloured through the app's --syn-* variables so it follows light/dark.
import { createCssVariablesTheme, createHighlighterCore } from 'shiki/core'
import type { HighlighterCore, LanguageRegistration } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

export interface HlSeg {
  t: string
  color: string
  fs: 'normal' | 'italic'
}

type LangLoader = () => Promise<{ default: LanguageRegistration[] }>

const LOADERS: Record<string, LangLoader> = {
  php: () => import('shiki/langs/php.mjs'),
  blade: () => import('shiki/langs/blade.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  astro: () => import('shiki/langs/astro.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  dotenv: () => import('shiki/langs/dotenv.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  python: () => import('shiki/langs/python.mjs'),
}

const EXT: Record<string, string> = {
  php: 'php', ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'jsx', vue: 'vue', css: 'css', scss: 'scss', json: 'json', jsonc: 'json', md: 'markdown', astro: 'astro', html: 'html',
  htm: 'html', xml: 'xml', svg: 'xml', yaml: 'yaml', yml: 'yaml', ini: 'ini', toml: 'ini', sh: 'shellscript', bash: 'shellscript',
  sql: 'sql', py: 'python',
}

/** Shiki language id for a path, or null for plain text. */
export function langFor(path: string): string | null {
  const b = (path || '').split('/').pop()!.toLowerCase()
  if (/^\.env/.test(b)) return 'dotenv'
  if (b.endsWith('.blade.php')) return 'blade'
  const e = (b.match(/\.([a-z0-9]+)$/) || [])[1] || ''
  return EXT[e] || null
}

// Default foreground: rendered as "inherit" so the row's own text colour applies.
const FG = 'var(--syn-fg)'
const v = (n: string) => `var(--syn-${n})`

const THEME = {
  ...createCssVariablesTheme({ name: 'canopy', variablePrefix: '--syn-' }),
  colors: { 'editor.foreground': FG, 'editor.background': 'transparent' },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment', 'string.quoted.docstring.multi'], settings: { foreground: v('com'), fontStyle: 'italic' } },
    { scope: ['string', 'string.quoted', 'string.template', 'string.regexp', 'markup.inline.raw', 'markup.fenced_code', 'property.value.dotenv', 'punctuation.definition.string'], settings: { foreground: v('str') } },
    { scope: ['constant.numeric', 'constant.other.color', 'keyword.other.unit', 'constant.character.escape'], settings: { foreground: v('num') } },
    { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'constant.language', 'variable.language', 'markup.heading', 'entity.name.section.markdown', 'punctuation.definition.heading.markdown', 'keyword.operator.new', 'keyword.operator.expression', 'keyword.operator.word', 'punctuation.section.embedded.begin.php', 'punctuation.section.embedded.end.php'], settings: { foreground: v('kw') } },
    { scope: ['keyword.operator', 'punctuation', 'meta.brace', 'keyword.operator.assignment.dotenv'], settings: { foreground: FG } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call.generic', 'variable.function', 'support.function.misc.css'], settings: { foreground: v('fn') } },
    { scope: ['entity.name.type', 'entity.name.class', 'entity.other.inherited-class', 'support.class', 'support.type', 'entity.name.namespace', 'support.other.namespace.php', 'storage.type.primitive'], settings: { foreground: v('ty') } },
    { scope: ['entity.name.tag', 'punctuation.definition.tag', 'support.class.component', 'entity.other.attribute-name.class.css', 'entity.other.attribute-name.id.css', 'entity.other.attribute-name.pseudo-class.css', 'entity.other.attribute-name.pseudo-element.css', 'punctuation.definition.list.begin.markdown', 'beginning.punctuation.definition.list.markdown', 'markup.list.unnumbered.markdown punctuation.definition.list'], settings: { foreground: v('tag') } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: v('at') } },
    { scope: ['variable.other.property', 'variable.other.object.property', 'support.variable.property', 'meta.object-literal.key', 'support.type.property-name', 'meta.property-name', 'entity.name.tag.yaml', 'variable.other.member'], settings: { foreground: v('pr') } },
    { scope: ['variable.other.php', 'variable.parameter.php', 'variable.language.this.php', 'punctuation.definition.variable.php', 'variable.css', 'variable.argument.css', 'variable.scss', 'variable.key.dotenv', 'variable.interpolation.dotenv'], settings: { foreground: v('var') } },
  ],
}

let hlP: Promise<HighlighterCore> | null = null
const loaded = new Map<string, Promise<boolean>>()

function highlighter() {
  if (!hlP) {
    hlP = createHighlighterCore({ themes: [THEME as any], langs: [], engine: createOnigurumaEngine(import('shiki/wasm')) })
  }
  return hlP
}

function ensureLang(h: HighlighterCore, lang: string) {
  let p = loaded.get(lang)
  if (!p) {
    const load = LOADERS[lang]
    p = load
      ? load().then(m => h.loadLanguage(...m.default)).then(() => true, () => false)
      : Promise.resolve(false)
    loaded.set(lang, p)
  }
  return p
}

/** Plain segments for a line (used before highlighting resolves, or for unknown languages). */
export function plainSegs(t: string): HlSeg[] {
  return [{ t, color: 'inherit', fs: 'normal' }]
}

/**
 * Highlights lines that form one block of code (a file, or a diff hunk) and returns segments per line.
 * Resolves to null when the language is unknown or the block is too large to tokenize comfortably.
 */
export async function highlightLines(lines: string[], path: string): Promise<HlSeg[][] | null> {
  const lang = langFor(path)
  if (!lang || !lines.length || lines.length > 6000) return null
  try {
    const h = await highlighter()
    if (!(await ensureLang(h, lang))) return null
    const toks = h.codeToTokensBase(lines.join('\n'), { lang, theme: 'canopy', tokenizeMaxLineLength: 2000 })
    return lines.map((t, i) => {
      const row = toks[i]
      if (!row || !row.length) return plainSegs(t)
      const out: HlSeg[] = []
      for (const tk of row) {
        const color = !tk.color || tk.color === FG ? 'inherit' : tk.color
        const fs = tk.fontStyle && (tk.fontStyle & 1) ? 'italic' : 'normal'
        const last = out[out.length - 1]
        if (last && last.color === color && last.fs === fs) last.t += tk.content
        else out.push({ t: tk.content, color, fs })
      }
      return out
    })
  } catch {
    return null
  }
}

export function useHighlighter() {
  return { langFor, highlightLines, plainSegs }
}
