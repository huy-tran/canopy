// A small Markdown renderer for PR descriptions and comments: headings, lists, quotes, code,
// bold, italics and links. Everything is escaped first, so the text can't inject HTML.
import { api } from './bridge'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(s: string) {
  const codes: string[] = []
  let t = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
  t = t
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, url) => `<a data-href="${url}">${alt || 'image'}</a>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a data-href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a data-href="$2">$2</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`)
}

/** Markdown to safe HTML. Links carry `data-href`, for the page to open in the browser. */
export function markdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const endList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = line.match(/^\s*```/)
    if (fence) {
      flush()
      endList()
      const code: string[] = []
      while (++i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i]!)
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    const li = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/)
    if (h) {
      flush()
      endList()
      out.push(`<h${Math.min(6, h[1]!.length + 2)}>${inline(h[2]!)}</h${Math.min(6, h[1]!.length + 2)}>`)
    } else if (li) {
      flush()
      const kind = li[1] ? 'ul' : 'ol'
      if (list !== kind) {
        endList()
        out.push(`<${kind}>`)
        list = kind
      }
      const box = li[3] ? `<input type="checkbox" disabled${li[3] !== ' ' ? ' checked' : ''}> ` : ''
      out.push(`<li>${box}${inline(li[4]!)}</li>`)
    } else if (/^\s*>\s?/.test(line)) {
      flush()
      endList()
      out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`)
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush()
      endList()
      out.push('<hr>')
    } else if (!line.trim()) {
      flush()
      endList()
    } else {
      endList()
      para.push(line)
    }
  }
  flush()
  endList()
  return out.join('\n')
}

/** For a container of rendered Markdown: opens its links in the browser. */
export function onMarkdownClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a[data-href]') as HTMLElement | null
  if (!a) return
  e.preventDefault()
  const url = a.dataset.href || ''
  if (/^https?:\/\//.test(url)) api.sys.openExternal(url)
}
