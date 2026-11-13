// Scripts run inside the preview pane's page (webview.executeJavaScript). The page is the user's own dev site, so
// they stay self-contained, touch nothing but their own overlay, and clean up after themselves.

/** What picking an element returns. */
export interface PickedElement {
  url: string
  title: string
  selector: string
  tag: string
  text: string
  attrs: Record<string, string>
  html: string
  rect: { x: number; y: number; width: number; height: number }
  styles: Record<string, string>
  /** Vue or React components the element belongs to, innermost first, with the source file when the dev build exposes it. */
  components: { name: string; file?: string }[]
  /** Shift was held on the click: the person is picking more. */
  more?: boolean
}

/** Highlights the element under the pointer; a click resolves with its description, Escape or `CANCEL_PICK_SCRIPT` with null. */
export const PICK_SCRIPT = `(() => new Promise((resolve) => {
  if (window.__canopyPick) window.__canopyPick(null)
  const box = document.createElement('div')
  const tip = document.createElement('div')
  const Z = '2147483647'
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:' + Z + ';border:2px solid #4f8cff;background:rgba(79,140,255,.14);border-radius:2px;transition:all 60ms'
  tip.style.cssText = 'position:fixed;pointer-events:none;z-index:' + Z + ';background:#1b2540;color:#fff;font:11px/1.4 ui-monospace,monospace;padding:2px 6px;border-radius:4px;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis'
  document.documentElement.append(box, tip)
  const prevCursor = document.documentElement.style.cursor
  document.documentElement.style.cursor = 'crosshair'
  let cur = null

  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')
  const selector = (el) => {
    const parts = []
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement && parts.length < 6; n = n.parentElement) {
      if (n.id && !/^[0-9]|\\s/.test(n.id)) { parts.unshift('#' + CSS.escape(n.id)); break }
      let s = n.tagName.toLowerCase()
      const cls = typeof n.className === 'string' ? n.className.trim().split(/\\s+/).filter((c) => c && !/[:\\[\\]\\/]/.test(c)).slice(0, 2) : []
      if (cls.length) s += '.' + cls.map((c) => CSS.escape(c)).join('.')
      const sibs = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : []
      if (sibs.length > 1) s += ':nth-of-type(' + (sibs.indexOf(n) + 1) + ')'
      parts.unshift(s)
    }
    return parts.join(' > ')
  }
  const components = (el) => {
    const out = []
    const vue = el.__vueParentComponent
    if (vue) {
      for (let c = vue; c && out.length < 4; c = c.parent) {
        const t = c.type || {}
        const n = t.__name || t.name
        if (n || t.__file) out.push({ name: n || 'Anonymous', file: t.__file })
      }
    }
    // Livewire: the component an element sits in is named in its wire:snapshot (v3) or wire:initial-data (v2).
    for (let n = el; n && out.length < 4; n = n.parentElement) {
      const snap = n.getAttribute && (n.getAttribute('wire:snapshot') || n.getAttribute('wire:initial-data'))
      if (snap) {
        try {
          const d = JSON.parse(snap)
          const name = (d.memo && d.memo.name) || (d.fingerprint && d.fingerprint.name)
          if (name) out.push({ name: 'livewire:' + name })
        } catch (e) {}
      }
    }
    // Inertia: the page component is in the app root's data-page.
    const root = document.querySelector('[data-page]')
    if (root) {
      try {
        const page = JSON.parse(root.getAttribute('data-page')).component
        if (page) out.push({ name: 'inertia:' + page })
      } catch (e) {}
    }
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
    if (key && !out.length) {
      for (let f = el[key]; f && out.length < 4; f = f.return) {
        const t = f.type
        if (typeof t === 'function' || (t && typeof t === 'object')) {
          const n = t.displayName || t.name
          if (n) out.push({ name: n, file: f._debugSource ? f._debugSource.fileName : undefined })
        }
      }
    }
    return out
  }
  const describe = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const attrs = {}
    for (const a of ['id', 'class', 'href', 'name', 'type', 'role', 'aria-label', 'placeholder', 'data-testid', 'wire:id']) {
      const v = el.getAttribute(a)
      if (v) attrs[a] = v.slice(0, 200)
    }
    const styles = {}
    for (const p of ['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'display', 'position', 'margin', 'padding', 'border']) styles[p] = cs.getPropertyValue(p)
    return {
      url: location.href, title: document.title, selector: selector(el), tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 240), attrs,
      html: el.outerHTML.length > 700 ? el.outerHTML.slice(0, 700) + '…' : el.outerHTML,
      rect: { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.round(r.width), height: Math.round(r.height) },
      styles, components: components(el),
    }
  }
  const move = (e) => {
    const el = e.target
    if (!(el instanceof Element) || el === box || el === tip) return
    cur = el
    const r = el.getBoundingClientRect()
    box.style.left = r.left + 'px'
    box.style.top = r.top + 'px'
    box.style.width = r.width + 'px'
    box.style.height = r.height + 'px'
    tip.textContent = name(el) + '  ' + Math.round(r.width) + ' x ' + Math.round(r.height)
    tip.style.left = Math.max(4, Math.min(r.left, innerWidth - 200)) + 'px'
    tip.style.top = (r.top > 26 ? r.top - 24 : r.bottom + 4) + 'px'
  }
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation() }
  const click = (e) => { stop(e); if (!cur) return finish(null); const d = describe(cur); d.more = e.shiftKey; finish(d) }
  const key = (e) => { if (e.key === 'Escape') { stop(e); finish(null) } }
  const swallow = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit', 'dblclick', 'contextmenu', 'auxclick']
  function finish(v) {
    document.removeEventListener('mousemove', move, true)
    document.removeEventListener('click', click, true)
    document.removeEventListener('keydown', key, true)
    for (const t of swallow) document.removeEventListener(t, stop, true)
    box.remove(); tip.remove()
    document.documentElement.style.cursor = prevCursor
    window.__canopyPick = null
    resolve(v)
  }
  window.__canopyPick = finish
  document.addEventListener('mousemove', move, true)
  document.addEventListener('click', click, true)
  document.addEventListener('keydown', key, true)
  for (const t of swallow) document.addEventListener(t, stop, true)
}))()`

/** Ends a pick in progress (the user switched the tool off). */
export const CANCEL_PICK_SCRIPT = 'window.__canopyPick && window.__canopyPick(null)'

/** The text pasted at Claude's prompt for a picked element. */
export function describePick(p: PickedElement, n = 0, of = 1): string {
  const lines = [`[Lookout element${of > 1 ? ` ${n} of ${of}` : ''}] ${p.url}`, `Selector: ${p.selector}`]
  if (p.components.length) lines.push(`Component: ${p.components.map(c => c.file ? `${c.name} (${c.file})` : c.name).join(' < ')}`)
  if (p.text) lines.push(`Text: "${p.text}"`)
  const attrs = Object.entries(p.attrs).filter(([k]) => k !== 'class' && k !== 'id').map(([k, v]) => `${k}="${v}"`).join(' ')
  if (attrs) lines.push(`Attributes: ${attrs}`)
  lines.push(`Size: ${p.rect.width} x ${p.rect.height} at ${p.rect.x},${p.rect.y}`)
  lines.push(`Styles: ${Object.entries(p.styles).map(([k, v]) => `${k}: ${v}`).join('; ')}`)
  lines.push(`HTML: ${p.html}`)
  return lines.join('\n') + '\n'
}
