# TiedUp 🎰

Play-money crypto casino & sportsbook (Stake.com-style UI). **Demo balance only — no real gambling.**

## Run it

```bash
npm install
npm run dev
```

Vite dev server: http://localhost:5173 (also served on your LAN so phones on the
same Wi-Fi can reach it).

## Share it

The app is **fully static** — every data source (ESPN, Polymarket, CoinGecko) sends
`access-control-allow-origin: *`, so the browser calls them directly and there is no
backend to host.

```bash
npm run build
```

That writes `dist/`. Drag that folder onto https://app.netlify.com/drop and you get a
public HTTPS URL you can text to anyone. Any static host works (Cloudflare Pages,
Vercel, GitHub Pages).

For hands-off updates, connect this repo to Netlify instead: `netlify.toml` is already
configured, so every push runs `npm run build` and publishes `dist/` automatically.

Wallet and bet history live in `localStorage`, which browsers scope per origin — so
`localhost:5173` and a deployed URL keep **separate balances**, and every visitor gets
their own private one.

Note: `server.js` was the old API proxy. It is no longer used by the app and can be
deleted along with the `express` / `concurrently` dependencies.

## What's inside

- **Casino:** Blackjack (3:2, dealer stands 17), European Roulette (animated 37-pocket wheel in true single-zero order), Slots, Crash (~1% edge), Dice (roll-under, 99÷chance payout), Wild Stack (UNO-style: same-value stacking + stackable +2/+4 penalties), Chess (full legal rules vs an engine; verified against standard perft suites)
- **Season Wins:** NFL / NBA / SEC over-under win totals, projected from real prior-season records; stack picks across leagues into a parlay.
- **Sportsbook:** MLB / NFL / CFB / NBA / WNBA / NHL / MLS / EPL / UFC with real games, records, live scores, and real DraftKings spreads, totals, and money lines (3-way with Draw for soccer; fight-by-fight for UFC) via ESPN's public scoreboard API. Markets with no posted line get a deterministic `SIM` tag.
- **CFB:** Power 4 browser — conference chips (SEC/B1G/B12/ACC) + week pager through the 2027 season (2027 games appear when ESPN publishes the schedule).
- **Parlays:** mix up to 32 legs across any sports/markets; combined odds = product of decimal odds; pushes drop out of the multiplier.
- **Player Props:** PrizePicks-style More/Less board (MLB/WNBA/NBA/NFL/CFB) — real players, lines projected from real season averages, settled against the real box score. 2–6 picks, 3x/5x/10x/20x/37.5x.
- **Predicts:** Kalshi-style event contracts with live Yes/No prices from Polymarket's public API; winning contracts pay out at 1.00.
- **My Bets:** open wagers settle against real results ("Check results" hits ESPN summaries / Polymarket).
- **Wallet:** demo 1 BTC starting balance in localStorage, live BTC/USD price via CoinGecko. "＋ Add BTC" deposits more play money (preset or custom amounts) or resets the wallet to 1 ₿.

## Tests

```bash
node src/games/wildStackRules.test.mjs
```

22 checks covering card matching and the +2/+4 penalty rules (draw cards never mix —
a +2 is only answered by another +2, a +4 only by another +4).

Chess move generation is verified with perft: the start position to depth 4
(197,281 nodes), plus Kiwipete and en-passant/promotion positions. Rerun both suites
if you touch `src/games/chessEngine.js` or `src/games/wildStackRules.js`.

## Notes

- No accounts, no real crypto, no payouts — the wallet is fake by design. Running this with real money would require gaming licenses; don't.
- ESPN/CoinGecko endpoints are unofficial public APIs and can change without notice.
