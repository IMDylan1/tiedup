# TiedUp — where things stand (Aug 1, 2026)

## Start it back up

```bash
npm --prefix /Users/admin/Games/tiedup run dev
```

Then: `http://localhost:5173` on the Mac, or `http://<mac-ip>:5173` on your phone
(same Wi-Fi). Get the current IP with `ipconfig getifaddr en0` — it was `10.0.0.251`,
but it can change after a router reboot.

## The one unfinished thing: publishing it

`dist/` is already built and ready (so is `tiedup-site.zip`). To get a link you can
text people:

1. Open https://app.netlify.com/drop
2. Drag the `dist` folder onto the page
3. It hands back a public HTTPS URL

Rebuild with `npm run build` after any change, then drop the folder again.

## If your phone can't reach the dev server

The macOS firewall is on with no allow-entry for node. This needs your password, so
you have to run it:

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node --unblockapp /usr/local/bin/node
```

## Things that surprised us once, worth remembering

- **Each URL has its own wallet.** Balances live in browser storage per origin, so
  `:5173`, `:4180` and any deployed link are separate. Not a bug.
- **No backend anymore.** `server.js` is dead code — the browser calls ESPN,
  Polymarket and CoinGecko directly. Safe to delete it and the `express` /
  `concurrently` deps.
- **Refreshing mid-hand** in Wild Stack or Chess forfeits that hand's stake, since
  game state lives in memory rather than storage.

## Ideas we never got to

- Leaderboard so friends can compare demo balances
- Same-game parlays / correlated legs
- Persisting Chess and Wild Stack games across refresh
- Live in-play line movement while a game is running
