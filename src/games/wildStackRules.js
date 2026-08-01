// Pure Wild Stack rules, kept out of the component so they can be tested directly.
export const COLORS = ['R', 'Y', 'G', 'B']
export const COLOR_NAMES = { R: 'Red', Y: 'Yellow', G: 'Green', B: 'Blue' }
export const NO_DRAW = { count: 0, type: null }

export const buildDeck = () => {
  const d = []
  for (const c of COLORS) {
    d.push({ c, v: '0' })
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⊘', '⇄', '+2']) {
      d.push({ c, v }, { c, v })
    }
  }
  for (let i = 0; i < 4; i++) d.push({ c: 'W', v: '★' }, { c: 'W', v: '+4' })
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

export const isAction = v => ['⊘', '⇄', '+2', '+4'].includes(v)
export const drawValue = v => (v === '+2' ? 2 : v === '+4' ? 4 : 0)

// With a draw penalty pending you may only counter with the SAME draw card:
// +2 onto a +2, +4 onto a +4. Mixing the two is not allowed.
export const playable = (card, top, curColor, draw) => {
  if (draw && draw.count > 0) {
    return card.v === draw.type
  }
  return card.c === 'W' || card.c === curColor || (card.v === top.v && top.c !== 'W')
}

// How a played stack of draw cards grows the pending pile.
export const growDraw = (draw, value, count) => ({
  count: draw.count + drawValue(value) * count,
  type: value
})
