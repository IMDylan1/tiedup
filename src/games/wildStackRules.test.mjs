// Run with: node src/games/wildStackRules.test.mjs
import { playable, growDraw, drawValue, isAction, buildDeck, NO_DRAW } from './wildStackRules.js'

let pass = 0, fail = 0
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`) }
}

const card = (c, v) => ({ c, v })
const P2 = { count: 2, type: '+2' }
const P4 = { count: 4, type: '+4' }
const top = card('R', '5')

console.log('\nDraw pile pending — only the SAME draw card may be added:')
ok(playable(card('G', '+2'), top, 'R', P2) === true, '+2 stacks onto a +2 pile (any color)')
ok(playable(card('W', '+4'), top, 'R', P2) === false, '+4 CANNOT be added to a +2 pile')
ok(playable(card('W', '+4'), top, 'R', P4) === true, '+4 stacks onto a +4 pile')
ok(playable(card('R', '+2'), top, 'R', P4) === false, '+2 CANNOT be added to a +4 pile')

console.log('\nDraw pile pending — nothing else is playable:')
ok(playable(card('R', '5'), top, 'R', P2) === false, 'matching color/number is blocked')
ok(playable(card('W', '★'), top, 'R', P2) === false, 'plain wild cannot counter')
ok(playable(card('R', '⊘'), top, 'R', P4) === false, 'skip cannot counter')

console.log('\nNo pile pending — normal matching:')
ok(playable(card('R', '9'), top, 'R', NO_DRAW) === true, 'color match')
ok(playable(card('B', '5'), top, 'R', NO_DRAW) === true, 'value match')
ok(playable(card('W', '★'), top, 'R', NO_DRAW) === true, 'wild always playable')
ok(playable(card('B', '9'), top, 'R', NO_DRAW) === false, 'no match is rejected')
ok(playable(card('B', '+2'), top, 'R', NO_DRAW) === false, '+2 needs color match to open a pile')

console.log('\nPile growth:')
ok(growDraw(NO_DRAW, '+2', 1).count === 2, 'single +2 opens a 2-card pile')
ok(growDraw(NO_DRAW, '+2', 3).count === 6, 'stacking three +2s = 6 cards')
ok(growDraw(P2, '+2', 2).count === 6, 'two more +2s onto a 2-pile = 6')
ok(growDraw(P4, '+4', 2).count === 12, 'two more +4s onto a 4-pile = 12')
ok(growDraw(P2, '+2', 1).type === '+2', 'pile type stays +2')

console.log('\nMisc:')
ok(drawValue('+2') === 2 && drawValue('+4') === 4 && drawValue('7') === 0, 'drawValue')
ok(isAction('⊘') && isAction('+4') && !isAction('3'), 'isAction')
ok(buildDeck().length === 108, 'deck is 108 cards')

const deck = buildDeck()
ok(deck.filter(c => c.v === '+4').length === 4, 'four +4s')
ok(deck.filter(c => c.v === '+2').length === 8, 'eight +2s')

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
