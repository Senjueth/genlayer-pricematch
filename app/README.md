# Demo app

A static page that talks to the contract deployed on GenLayer Testnet Bradbury (address in the page header).
Reads work without a wallet; writes go through MetaMask.

Files:
- `index.html` — the page
- `gl.js` — wallet + read/write helpers
- `app.css` — styles
- `check-actions.mjs` — asserts which controls each purchase state shows to buyer, shop and others (`node app/check-actions.mjs app/index.html`, runs in CI)
- `genlayer.js` — not committed; a browser bundle of `genlayer-js@1.1.8`:

```bash
npm i genlayer-js@1.1.8 esbuild
printf 'export { createClient, createAccount } from "genlayer-js";\nexport { testnetBradbury } from "genlayer-js/chains";\n' > entry.js
npx esbuild entry.js --bundle --format=esm --minify --platform=browser --outfile=app/genlayer.js
```

Serve the folder with any static server (`python -m http.server -d app`). Fonts (Plus Jakarta Sans, JetBrains Mono) load from Google Fonts; without them the system font is used. The `gh-pages` branch carries the built `genlayer.js`.
