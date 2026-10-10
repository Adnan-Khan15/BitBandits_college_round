# ShopLite — demo upstream (Dev D fixture)

ShopLite is the "original application" PATCHWORK never gets to rebuild: a small
e-commerce shop with a real bug on `/cart` (the checkout button's handler calls
`startChekout()`, which is not defined), and a **v2 redeploy** that redesigns the
cart the way a real upstream occasionally does — moving and renaming the very
elements PATCHWORK's patches point at.

This is the scratch draft (hour 0–2.5). After CONTRACT FREEZE it is copied into
the repo as `fixtures/target-site/` (see *Moving it into the repo* below).

## Run

```bash
node server.mjs                 # binds 127.0.0.1:4200 (PW_TARGET_PORT), starts on v1
```

| Route             | Serves                                |
| ----------------- | ------------------------------------- |
| `/`               | `index.html` — promo banner, 4 cards, price typo `₹12,99` |
| `/cart`           | `cart.html` — the broken checkout button |
| `/checkout`       | `checkout.html` — name/address form → `/order/success` |
| `/order/success`  | `success.html` — confirmation         |
| `/styles.css`     | active version's stylesheet           |
| `/app.js`         | active version's script               |

Zero dependencies, no external fonts, images or CDNs — the demo works offline.

## Switch versions

```bash
# what version is live
curl http://localhost:4200/__upstream/version

# simulate the upstream's own redeploy
curl -X POST http://localhost:4200/__upstream/version \
  -H 'content-type: application/json' -d '{"version":"v2"}'

# and back
curl -X POST http://localhost:4200/__upstream/version \
  -H 'content-type: application/json' -d '{"version":"v1"}'
```

The switch is in-memory and resets to `v1` when the server restarts. CORS is
enabled on this endpoint only, for `http://localhost:5173` (editor) and
`http://localhost:4000` (control plane), so the demo-control button in the UI can
flip versions during the demo.

## What v2 changes (the drift surface)

1. **Cart redesigned.** The checkout button moves into a new
   `<footer class="cart-bar">`; its id becomes `cta-checkout` and its classes
   become `button button--primary`. A look-alike decoy
   `<button class="button button--secondary">Save cart for later</button>` sits
   next to it.
2. **Promo banner removed.** The expired "Diwali sale — ends 31 Oct 2025" banner
   is gone from the home page.
3. **Price element renamed and wrapped.** `<span class="price">₹12,99</span>`
   becomes `<span class="price-amount"><span class="amount">₹12,99</span></span>`.
4. **The bug is inherited.** The v2 checkout button still calls the undefined
   `startChekout()`, so the raw site stays broken in both versions — exactly the
   backstory case.

## Drift intent for the three demo patches

These are the demo patches (`scripts/demo-setup.ts` creates P1–P3 against this
site). The **engine's actual output is the truth**; this table records intent.

| Patch | v1 anchor | v2 reality | Expected status on v2 |
| ----- | --------- | ---------- | --------------------- |
| P1 *Fix checkout button* (`setBehavior` click → navigate `/checkout`) | `#checkout-btn`, classes `btn btn-primary`, text "Proceed to checkout" | moved into `footer.cart-bar`, renamed `cta-checkout` / `button button--primary`; decoy "Save cart for later" beside it | **relocated / healed** — evidence expected from text, accessible name, `button` class overlap and position; the "Save cart for later" decoy is the expected runner-up |
| P2 *Fix price typo* (`setText` on the price) | `span.price`, text `₹12,99` | class renamed to `amount`, wrapped in `price-amount`; text unchanged | **exact or relocated** — text matches exactly, ancestors changed |
| P3 *Hide expired promo* (`hide`) | `#promo-banner`, text "Diwali sale — ends 31 Oct 2025" | element removed from v2 | **not_found / broken** — must abstain, not re-home to another banner |

## Held-out drift benchmark (same PR, hour 2.5)

`heldout/` holds **15 cases** in the PLAN §11.16 format — `before.html`,
`after.html`, `case.json` — distribution **renamed 3, moved 3, wrapped 2, text 2,
tag 1, removed 2, decoy 2**, across blog, dashboard, form and shop page types.
They were written **without reading** the resolver or Dev B's dev cases, so they
stay an honest test set. Each `targetBefore` matches exactly one element in
`before.html`; non-removed cases point at exactly one `expectedAfter` in
`after.html`.

## Verify

```bash
node verify.mjs    # 165 checks: server behaviour, version switch, CORS rules,
                   # the v1/v2 bug, the v2 drift surface, and all 15 cases
```

The click-level `ReferenceError: startChekout is not defined` is proven live at
the hour-2.5 gate (`npm run target` + Playwright, PLAN §15); here it is proven
statically (`app.js` calls `startChekout()` and never defines it, and it is the
only script on the page).

## Moving it into the repo (after CONTRACT FREEZE)

```bash
mkdir -p fixtures/target-site fixtures/drift-benchmark/heldout
cp -r server.mjs v1 v2 README.md fixtures/target-site/
cp -r heldout/. fixtures/drift-benchmark/heldout/
```

Then commit on `feat/ui-workflow` (`feat(web): …`) — those are Dev D's owned
paths — and hand the hour-2.5 report to Gaurav for the PR. One jsdom-based
uniqueness pass over the 15 `targetBefore`/`expectedAfter` selectors runs once
the scaffold has merged (jsdom is then a repo dependency); until then the
selectors are unique by construction.
