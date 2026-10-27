/* ============================================================================
   The runtime the .dc.html mockups were authored against

   Every mockup loads `./support.js`, and that file did not come with them —
   so none of them opened. This is a stand-in, written from the shape of the
   files themselves: enough of the templating to render each mockup exactly
   as its author saw it, and nothing more.

   It is a TOOL, not product code. It ships in docs/ and never reaches the
   app. Its only job is to put the target on screen next to the build.

   What the mockups use:

     <helmet>…</helmet>                 moved into <head>
     {{name}} / {{a.b}}                 looked up in renderVals(), then scope
     <sc-for list="{{xs}}" as="x">      repeated once per item
     <sc-if value="{{c}}">              kept when c is truthy
     onClick="{{fn}}" / onPointerMove   bound as listeners
     hint-placeholder-*                 ignored
     class Component extends DCLogic    state + renderVals(), re-rendered on
                                        setState
   ============================================================================ */

(function () {
  'use strict'

  /* The two images the mockups point at by content hash. They are in the
     folder beside this one, under the names the brief gives them. */
  const BLOBS = {
    '/_blob/8aaab49968b2557e9a396d3ed2a6454e': '../assets/bg-lago.jpg',
    '/_blob/96f5d53fdea71a84ac120f86dee831f1': '../assets/bg-colinas.jpg',
  }

  const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g

  /** `a.b.c` against the scope chain, innermost first. */
  function lookup(path, scopes) {
    const parts = path.split('.')
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      let cur = scopes[i]
      if (cur == null || !(parts[0] in cur)) continue
      for (const p of parts) {
        if (cur == null) break
        cur = cur[p]
      }
      return cur
    }
    return undefined
  }

  /** "{{x}}" alone returns the VALUE; mixed text returns a string. */
  function interpolate(text, scopes) {
    const whole = text.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/)
    if (whole) return lookup(whole[1], scopes)
    return text.replace(TOKEN, (_, p) => {
      const v = lookup(p, scopes)
      return v == null ? '' : String(v)
    })
  }

  const EVENTS = { onclick: 'click', onpointermove: 'pointermove', onpointerdown: 'pointerdown', oninput: 'input', onchange: 'change' }

  function build(node, scopes) {
    const frag = document.createDocumentFragment()
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.nodeValue
      const has = /\{\{/.test(t)
      frag.appendChild(document.createTextNode(has ? String(interpolate(t, scopes) ?? '') : t))
      return frag
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return frag

    const tag = node.tagName.toLowerCase()

    if (tag === 'sc-for') {
      const list = interpolate(node.getAttribute('list') || '', scopes)
      const as = node.getAttribute('as') || 'item'
      if (Array.isArray(list)) {
        for (const item of list) {
          const frame = {}
          frame[as] = item
          for (const child of node.childNodes) frag.appendChild(build(child, scopes.concat([frame])))
        }
      }
      return frag
    }

    if (tag === 'sc-if') {
      if (interpolate(node.getAttribute('value') || '', scopes)) {
        for (const child of node.childNodes) frag.appendChild(build(child, scopes))
      }
      return frag
    }

    const el = document.createElementNS(node.namespaceURI, node.tagName)
    for (const { name, value } of Array.from(node.attributes)) {
      if (name.startsWith('hint-placeholder')) continue
      const ev = EVENTS[name.toLowerCase()]
      if (ev) {
        const fn = interpolate(value, scopes)
        if (typeof fn === 'function') el.addEventListener(ev, fn)
        continue
      }
      const v = interpolate(value, scopes)
      el.setAttribute(name, v == null ? '' : String(v))
    }
    for (const child of node.childNodes) el.appendChild(build(child, scopes))
    return frag.appendChild(el), frag
  }

  class DCLogic {
    constructor(props) {
      this.props = props || {}
      this.state = {}
    }
    setState(patch) {
      Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch)
      if (this._paint) this._paint()
    }
  }
  window.DCLogic = DCLogic

  function swapBlobs(css) {
    let out = css
    for (const [hash, file] of Object.entries(BLOBS)) out = out.split(hash).join(file)
    return out
  }

  function boot() {
    const host = document.querySelector('x-dc')
    if (!host) return

    const helmet = host.querySelector('helmet')
    if (helmet) {
      for (const node of Array.from(helmet.children)) {
        if (node.tagName === 'STYLE') node.textContent = swapBlobs(node.textContent)
        document.head.appendChild(node)
      }
      helmet.remove()
    }

    const template = document.createElement('template')
    template.content.appendChild(document.createRange().createContextualFragment(host.innerHTML))

    const logic = document.querySelector('script[type="text/x-dc"]')
    let instance = null
    if (logic) {
      const props = JSON.parse(logic.dataset.props || '{}')
      // eslint-disable-next-line no-new-func
      const Component = new Function('DCLogic', logic.textContent + '\nreturn Component')(DCLogic)
      instance = new Component(props)
    }

    const paint = () => {
      const vals = instance && instance.renderVals ? instance.renderVals() : {}
      host.textContent = ''
      for (const child of Array.from(template.content.childNodes)) {
        host.appendChild(build(child, [vals]))
      }
      for (const img of host.querySelectorAll('[src], [href]')) {
        for (const a of ['src', 'href']) {
          const v = img.getAttribute(a)
          if (v && BLOBS[v]) img.setAttribute(a, BLOBS[v])
        }
      }
    }
    if (instance) instance._paint = paint

    const preview = (instance && instance.props && instance.props.$preview) || null
    if (preview) {
      document.documentElement.style.setProperty('--dc-w', preview.width + 'px')
      host.style.display = 'block'
      host.style.width = preview.width + 'px'
    }

    paint()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
