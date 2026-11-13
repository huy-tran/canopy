import { describe, expect, it } from 'vitest'
import { describePick, type PickedElement } from '../app/utils/previewPicker'

const el: PickedElement = {
  url: 'http://localhost:4567/',
  title: 'Fixture',
  selector: 'body > div.card:nth-of-type(1) > button.buy',
  tag: 'button',
  text: 'Buy now',
  attrs: { class: 'buy', id: 'x', 'aria-label': 'Buy' },
  html: '<button class="buy">Buy now</button>',
  rect: { x: 41, y: 223, width: 83, height: 34 },
  styles: { color: 'rgb(0, 0, 0)', display: 'inline-block' },
  components: [{ name: 'PricingCard', file: 'resources/js/PricingCard.vue' }, { name: 'Page' }],
}

describe('describePick', () => {
  it('names the page, selector, component file, text, size and html', () => {
    const t = describePick(el)
    expect(t).toContain('[Lookout element] http://localhost:4567/')
    expect(t).toContain('Selector: body > div.card:nth-of-type(1) > button.buy')
    expect(t).toContain('Component: PricingCard (resources/js/PricingCard.vue) < Page')
    expect(t).toContain('Text: "Buy now"')
    expect(t).toContain('Size: 83 x 34 at 41,223')
    expect(t).toContain('HTML: <button class="buy">Buy now</button>')
  })

  it('leaves out class and id from the attributes, which the selector already carries', () => {
    expect(describePick(el)).toContain('Attributes: aria-label="Buy"')
    expect(describePick(el)).not.toContain('class="buy" id')
  })

  it('numbers elements when several are picked', () => {
    expect(describePick(el, 2, 3)).toContain('[Lookout element 2 of 3] http://localhost:4567/')
  })

  it('skips what the page did not give', () => {
    const t = describePick({ ...el, components: [], text: '', attrs: {} })
    expect(t).not.toContain('Component:')
    expect(t).not.toContain('Text:')
    expect(t).not.toContain('Attributes:')
  })
})
