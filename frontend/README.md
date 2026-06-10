# Bizzy Base Transfer

Static transfer page for a reserved list of Base mainnet users.

## Files

- `index.html`: page shell.
- `config.js`: chain, token, and reserved-user configuration.
- `app.js`: wallet connection, Base network switch, balance reads, and ERC20 `transfer`.
- `style.css`: page styling.

## Configure Users

Edit `window.TRANSFER_APP_CONFIG.users` in `config.js`.

```js
{
  label: "Alice",
  wallet: "0xSenderWallet...",
  defaultRecipient: "0xRecipient...",
  assets: {
    usdb: { amount: "100" },
    yes: { amount: "10" },
    no: { amount: "10" },
  },
}
```

The connected wallet must match `wallet`; otherwise transfer buttons stay disabled.

## Configure Tokens

USDB is prefilled from the Buzzing Base deployment state:

`0x89401d7C5F5Cf4936F10418B9C536f97b0bCf71B`

YES and NO holdings are market-level positions under each user. Fill each
position's `tokenAddress` and set `enabled: true` when ready.

## Local Preview

Open `index.html` directly, or run a static server:

```bash
npm run serve:frontend
```

Then open `http://127.0.0.1:4173/`.

## Vercel Deploy

This project follows the faucet repo layout:

- Root `vercel.json` rewrites `/` to `/frontend/index.html`.
- Static assets are served from `/frontend`.
- No build step is required.

In Vercel, import this repository and keep Framework Preset as `Other` or
static/default. Leave Build Command and Output Directory empty unless Vercel
requires values for your project settings.
