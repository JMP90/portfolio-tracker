# Portfolio Tracker

Gianmarco's portfolio, as a static site. It opens in the browser on a phone or a desktop — nothing to install — at:

**https://jmp90.github.io/portfolio-tracker/**

The same screens as the previous app are here: Dashboard (category totals, open perps and spot), Holdings, Assets, DCA, Ichimoku trades and tranches, the trade calculator, Pionex bots, AMM LPs, the BTC Accumulation Protocol, monthly and weekly reports, Issues, and backup/export. You can add it to the home screen (it is a PWA).

## Unlocking

The repository is public. Every holding, trade, note and screenshot is ciphertext in `data/portfolio.enc` and `data/blobs/`. The site asks for the password and decrypts only in the browser (AES-GCM, key from PBKDF2-SHA256, 600,000 iterations, random salt). A wrong password fails the authenticity check and nothing is shown.

Change the password under **Settings**. That re-wraps the key and commits a new `data/portfolio.enc`. Minimum 10 characters.

## Saving from a phone or laptop

Edits are re-encrypted locally. To commit them back to this repo, paste a **fine-grained personal access token** once per device:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Resource owner: **JMP90**.
3. Repository access: **Only select repositories** → **portfolio-tracker**.
4. Permissions → Repository permissions → **Contents: Read and write**. Leave everything else off.
5. Paste the token (`github_pat_…`) in the app under **Settings**.

The token stays in that browser's `localStorage`, encrypted with the portfolio password. It is not written into the repo. If GitHub already has a newer copy, the app reloads it, merges records, and warns when the same row changed in both places. A copy of the ciphertext is also cached on the device so the last unlocked data opens offline.

## Prices

- Crypto: CoinGecko, fetched live in the browser.
- FX: Frankfurter.
- Stocks, commodities and indices: Yahoo Finance does not allow browser requests, so the app keeps the stored price and marks it **stored**. **Use manual price** on an asset still overrides everything.

## Pages

GitHub Actions (`.github/workflows/pages.yml`) publishes the site. If the Actions run is waiting on a setting, open the repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
