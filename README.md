# Buzzing Asset Transfer

Static Base mainnet transfer page for a reserved list of users.

## What It Does

- Connects a browser wallet.
- Switches the wallet to Base mainnet.
- Checks whether the connected wallet is in the reserved user list.
- Lets an allowed user transfer configured assets one by one.
- Reads ERC20 balances and sends standard ERC20 `transfer` transactions.

## Configuration

Edit `frontend/config.js`.

- `tokens`: USDB is prefilled. Fill YES and NO token addresses when ready.
- `users`: reserved user list. The connected wallet must match `wallet`.

User entry example:

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

## Local Preview

```bash
npm run check
npm run serve:frontend
```

Open `http://127.0.0.1:4173/`.

## Vercel

This repository is a no-build static app.

- `vercel.json` rewrites `/` to `/frontend/index.html`.
- Static files are served from `frontend`.
- In Vercel, use the default/static or `Other` framework preset.
