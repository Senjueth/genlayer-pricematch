# PriceMatch — a price-match guarantee that pays out without the shop's say-so

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

"Found it cheaper elsewhere? We'll refund the difference." Shops promise it;
the shop then decides whether your screenshot counts, whether the product is
"really the same", whether the other store is "a real competitor". **PriceMatch**
is an Intelligent Contract that keeps the promise without the shop in the loop:
the buyer's payment sits in escrow for the guarantee window, and a claim is
judged by GenLayer validators who each read the competitor's page and must
agree on what it shows. A lower price refunds the difference straight from the
escrow.

```
shop ──── list_product(identity, currency, list price, GEN price, competitor domains, window) ──▶ PriceMatch
buyer ─── buy(product) + GEN ── escrow ──────────────────────────────────────────────────────────▶
buyer ─── claim(purchase, competitor URL) ── validators read the page ── lower? refund the difference
anyone ── release(purchase) after the window ── rest of the escrow ──▶ shop
anyone ── settle_payout ── validators read that transfer's result; failed → recoverable by its payee
```

## Live deployment

App: source in [`app/`](app/) (products, purchases, claims with what validators read, payouts, every role's actions)  
Testnet Bradbury (chainId 4221): [`0x62a833516A8C5C559f6D441159423f5A7287Cfd8`](https://explorer-bradbury.genlayer.com/address/0x62a833516A8C5C559f6D441159423f5A7287Cfd8)

## Bradbury evidence

Run by [`tests/integration/test_price_match.py`](tests/integration/test_price_match.py) (6 passed, 2 h 11 min). Contract `0x62a833516A8C5C559f6D441159423f5A7287Cfd8` (deploy [`0x9d23488f…`](https://explorer-bradbury.genlayer.com/tx/0x9d23488f7e7e5d17ff1f3dd052b12534febaac5eb5cf2924d88e2140c15df03d)), code `build/price_match.py` (sha256 `5a7fab01…`). Shop and buyer are separate accounts; validators fetched the pages live. Every claim stores the page's SHA-256: the same book's page hashed `a6e572bec156…` in all three claims.

| Purchase | Step | Transaction | Outcome |
|---|---|---|---|
|  | list product 0: £60.00, 0.006 GEN, competitor books.toscrape.com, 1 h window | [`0xe1a2763e…`](https://explorer-bradbury.genlayer.com/tx/0xe1a2763e67b9c281b250d01b171ee6d69f93d79ca5273aaed3a5043337ca216c) | ok |
|  | list product 1: same book at £50.00, 0.005 GEN | [`0x1ecb8fab…`](https://explorer-bradbury.genlayer.com/tx/0x1ecb8fab690cf2383b395a61fdfea2aaab0dd9ba68c315ca28103db52f35877a) | ok |
| #0 | buy product 0 | [`0x96dc9027…`](https://explorer-bradbury.genlayer.com/tx/0x96dc90274dc35a455d21761b2a1a14a2042320144ab52f2e3fa74384cdd0e969) | 0.006 GEN in escrow |
| #0 | claim with another book's page (£53.74) | [`0x99016ce3…`](https://explorer-bradbury.genlayer.com/tx/0x99016ce3100f42cda363825c2dae52572c60fc248bc2add53ac37956a96af46a) | rejected: **not the same product** |
| #0 | claim with the same book's page (£51.77) | [`0x5ce23b1c…`](https://explorer-bradbury.genlayer.com/tx/0x5ce23b1c48b30cf906ac340c399adeb7c3d408b2e6cd301fcbbab9d2ce35bdc1) | **matched**: refund 823/6000 of the price = 0.000823 GEN (payout 0) |
| #1 | buy product 1 | [`0xdeb279a8…`](https://explorer-bradbury.genlayer.com/tx/0xdeb279a8c3a609325761e085ac92a18fd2d83f981116a0f8dbf30cdd2571b9b6) | 0.005 GEN in escrow |
| #1 | claim on example.com | [`0xa027122f…`](https://explorer-bradbury.genlayer.com/tx/0xa027122f2a9a3b681cd7165ab1cf7b1e3947b2cb1df8e8dd9b9281d01dc3162b) | reverted before any fetch: domain not listed |
| #1 | claim with the same book's page | [`0xb08bf2ad…`](https://explorer-bradbury.genlayer.com/tx/0xb08bf2ad7e57e75bb962a4bd759dc35aec341944bb7a51cb82d6af9c1437045c) | rejected: **not lower than the price paid** |
| #2 | buy product 0, refund to a contract that rejects value | [`0xc4021818…`](https://explorer-bradbury.genlayer.com/tx/0xc4021818adc4bf84d299202e57a9c4ee0eae91d0d89c9dddfef6778fe9d77c5d) | 0.006 GEN in escrow |
| #2 | claim with the same book's page | [`0x02b1bc11…`](https://explorer-bradbury.genlayer.com/tx/0x02b1bc1105f63517a9ddedbf63eb6f0edc081b0d3921333a4c1a4852eb665003) | **matched**: refund 0.000823 GEN to the rejecter (payout 1) |
|  | release #0, #1, #2 after the window | [`0x840558d9…`](https://explorer-bradbury.genlayer.com/tx/0x840558d9498b30cb9a0672ec1fb4d9eab67e431393721e5321ba77d914a6ef9e) | payouts 2–4 to the shop (also [`0xf9df6c7a…`](https://explorer-bradbury.genlayer.com/tx/0xf9df6c7a89da5c1e074de90a1baad4da1f88092ca64fbba5164cd990e79ee0ed), [`0x33f63888…`](https://explorer-bradbury.genlayer.com/tx/0x33f638886241ba3a722ff836b94c48dcc23a492f57c53c845222d378a8acb66f)) |
| #2 | buyer recovers the failed refund to their own address | [`0x657541ba…`](https://explorer-bradbury.genlayer.com/tx/0x657541baa1c09eddc4bdc20a23509bd8f93d1a6ebca17986b0d11d08a2e12d97) | payout 5 |

Each payout settled from its own transfer after the paying transaction finalized. Balance change is the recipient's `eth_getBalance` at the finalizing block minus the block before, checked by the test:

| Payout | Kind | Paid by | Finalized by (block) | Recipient balance | `settle_payout` | Result |
|---|---|---|---|---|---|---|
| 0 | refund → buyer | [`0x5ce23b1c…`](https://explorer-bradbury.genlayer.com/tx/0x5ce23b1c48b30cf906ac340c399adeb7c3d408b2e6cd301fcbbab9d2ce35bdc1) | [`0xfd45a137…`](https://explorer-bradbury.genlayer.com/tx/0xfd45a137c8caabb7e52e9733361e93dd6428474d1baef861ff72fca5d852e3ab) (25276529) | +0.000823 GEN | [`0xa1143646…`](https://explorer-bradbury.genlayer.com/tx/0xa1143646c2b1c7ea6fe330ff198deb85f9bfc3730b39f9c3f7bed562f15f5eae) | DELIVERED |
| 1 | refund → rejecter | [`0x02b1bc11…`](https://explorer-bradbury.genlayer.com/tx/0x02b1bc1105f63517a9ddedbf63eb6f0edc081b0d3921333a4c1a4852eb665003) | [`0xd1ffeb9f…`](https://explorer-bradbury.genlayer.com/tx/0xd1ffeb9f91591af1ee70dda1435fe63822ece31cef2b93617a91965e283dc08f) (25276659) | 0 GEN | [`0x8ff324cd…`](https://explorer-bradbury.genlayer.com/tx/0x8ff324cd1d8aa619ac15ca05a480479eb1c39af94107627b8cd467ad9d20b044) | FAILED: recoverable by the buyer |
| 2 | release #0 → shop | [`0x840558d9…`](https://explorer-bradbury.genlayer.com/tx/0x840558d9498b30cb9a0672ec1fb4d9eab67e431393721e5321ba77d914a6ef9e) | [`0x6842f7e1…`](https://explorer-bradbury.genlayer.com/tx/0x6842f7e10af6c4c347bcd3204e7c2fa31f1dbdda5aaf3c1cdca210ffcf711fdc) (25280292) | +0.005177 GEN | [`0xef2470d1…`](https://explorer-bradbury.genlayer.com/tx/0xef2470d119b42da514ceed234721ec60b0f39a76ddc6e9a64cb77c2acd2c42f5) | DELIVERED |
| 3 | release #1 → shop | [`0xf9df6c7a…`](https://explorer-bradbury.genlayer.com/tx/0xf9df6c7a89da5c1e074de90a1baad4da1f88092ca64fbba5164cd990e79ee0ed) | [`0x390a9fae…`](https://explorer-bradbury.genlayer.com/tx/0x390a9fae4d39e215ef617f0811db5426bead44c9b7c5f4da7a9f3bcdc0e1c261) (25280323) | +0.005 GEN | [`0xbefb9304…`](https://explorer-bradbury.genlayer.com/tx/0xbefb93049ab14693368358500e872d239f9d5603cbf318d5b0e31eb3d8c3c5dc) | DELIVERED |
| 4 | release #2 → shop | [`0x33f63888…`](https://explorer-bradbury.genlayer.com/tx/0x33f638886241ba3a722ff836b94c48dcc23a492f57c53c845222d378a8acb66f) | [`0xa4869456…`](https://explorer-bradbury.genlayer.com/tx/0xa4869456988296262a60d9976a9d6ee51d90ecf58cb83132055218ea0cca8d37) (25280341) | +0.005177 GEN | [`0xa23fb385…`](https://explorer-bradbury.genlayer.com/tx/0xa23fb385d78438afedab96f47a937e44dac1e7817d118fea4be7bf4c8a7123bc) | DELIVERED |
| 5 | recover → buyer | [`0x657541ba…`](https://explorer-bradbury.genlayer.com/tx/0x657541baa1c09eddc4bdc20a23509bd8f93d1a6ebca17986b0d11d08a2e12d97) | [`0x41ad54f2…`](https://explorer-bradbury.genlayer.com/tx/0x41ad54f2d62a3d59c38cb63f6651412bc6ae05ca86c19063676a407181e272d4) (25282463) | +0.000823 GEN | [`0xb995c68f…`](https://explorer-bradbury.genlayer.com/tx/0xb995c68f1e99946bba9bff63ffb4cece7020b494e3c85c0874bab49ea7a8f86e) | DELIVERED |

Settling the same payout again is rejected each time ([`0x42598450…`](https://explorer-bradbury.genlayer.com/tx/0x42598450951f394807efe881d93bfee18ea2886a640dc32cc27a3e09f852a195), [`0xeb5e4ced…`](https://explorer-bradbury.genlayer.com/tx/0xeb5e4cedc5e5f4508a22a49c921bfaae521d4570520a6ba25e8011fa4c7d74ab), [`0xaf60b4b0…`](https://explorer-bradbury.genlayer.com/tx/0xaf60b4b0f6c59f4cbb0a73cde33a3409e8f44414549af3f63f457acc8b379541), [`0x540f9832…`](https://explorer-bradbury.genlayer.com/tx/0x540f9832d86c7eb9936e6f0fd172b29c30e61b850bf9ae0db151efc6887977a8), [`0x1bd36971…`](https://explorer-bradbury.genlayer.com/tx/0x1bd36971c405e1680601568d2636fb20b9695bb1af33c95f91dc47cbec93f406), [`0x56da1634…`](https://explorer-bradbury.genlayer.com/tx/0x56da1634e0f8e48c21e7d45edc01da51924eb9f09e7e0d63f19c3bc8abe00f88)). Afterwards `get_accounting` reports expected balance 0, `unaccounted: 0`.

The competitor in the E2E is [books.toscrape.com](https://books.toscrape.com),
a public demo store built for scraping practice: its pages are stable, so the
run is reproducible. It is not a real shop; the mechanism does not depend on
the site, only on the page showing the product and its price in plain HTML.

## What it does

| Layer | Mechanism | Depends on the LLM? |
|---|---|---|
| Terms | Fixed at purchase: the product identity, the list price and currency, what was paid, the deadline. `update_listing` changes only future purchases | No |
| Who and where | Only the buyer claims, only before the deadline, at most 3 claims, one match. The URL must be https on a domain the shop listed (or its subdomain); anything else reverts before any fetch | No |
| Reading the page | Validators each fetch the page and report `{same_product, in_stock, currency, price, quote}` | Yes, by consensus |
| Outcome | Derived from the agreed reading: different product, out of stock, other currency, no price, or not lower → rejected with that reason; otherwise matched | No |
| Refund | `paid × (list − found) / list`, capped by what is still held; paid at once from escrow to the buyer (or `refund_to`) | No |
| Release | After the window anyone can release what is held to the shop | No |
| Payout ledger | Every refund, release and recovery is a payout settled from its own transfer's on-chain result; a failed one becomes recoverable by its payee | Consensus over chain data, no LLM |

## Consensus design

The leader fetches the page, strips the HTML and asks the model whether it is
the product the buyer bought (the shop's identity text: brand, model, variant,
condition, codes), whether it is in stock, and its price as a plain number with
its ISO currency. The price string is parsed deterministically into minor
units (`51.77` → 5177; anything that is not a plain amount → no price).

Each validator re-fetches and re-reads the page, and accepts only if **every
field the outcome depends on is identical**: same product, in stock, currency
and price to the cent. There is no tolerance: a price that is "about" the same
could flip "not lower" into a refund. The quote (≤ 80 chars) is evidence, not
compared. Validators then derive the outcome and refund from the agreed fields
in contract code, so the model never chooses an amount.

Errors follow the official classes: a dead page (`[EXTERNAL] competitor page
unavailable`) is agreed and the transaction reverts, so the buyer keeps the
claim; a malformed model answer is `[LLM_ERROR]`, rejected so a new leader is
chosen.

### What is recorded

The page is judged once, at claim time, as validators fetch it: a claim means
"this was the price when I claimed". Every claim stores the URL, the outcome
and reason, the agreed fields, the price text the leader quoted, the SHA-256 of
the response body the leader judged and the length of the text, so anyone can
later check what was read (`get_claims`). Pages longer than 8,000 characters
are cut, never silently: the prompt says
`[TRUNCATED: first 8000 of N characters shown]`.

Prompt injection: the identity (shop-written) and the page (web) are fenced in
`<<< >>>` with delimiter neutralisation; the model only reports what it sees,
and amounts follow from contract state.

## Payments and settlement

A value transfer from a GenLayer contract executes when the paying transaction
finalizes, so the contract never assumes a payment arrived.

- `claim` (refund), `release` and `recover` first check the contract holds the
  amount, then record a **payout** (`get_payouts`) with the paying
  transaction's sender and creation time. One payout per sender per second, so
  that pair identifies the paying transaction.
- `settle_payout(payout_id, tx_hash, finalize_tx)`, callable by anyone, has
  validators read the chain and agree:
  1. `gen_getTransactionReceipt(tx_hash)` must be this contract's, from the
     payout's sender at its creation time, executed successfully and
     finalized, and its calldata must be the call that created the payout
     (method, purchase, and for `recover` the address).
  2. `eth_getTransactionReceipt(finalize_tx)` must be the consensus
     transaction that emitted `TransactionFinalized(tx_hash)`.
  3. **DELIVERED** if it holds this contract's `TransactionExecuted` to the
     payout's recipient with a message id linked to `tx_hash`; **FAILED** if
     it holds the messages contract's execution-failed event for `tx_hash`.
     Neither (a call that sent nothing) settles nothing.
- A FAILED payout is credited to its payee (buyer for refunds, shop for
  releases); `recover(purchase, to)` re-sends it to any address.
- A payout settles once, and a paying transaction settles at most one payout.
- `get_accounting` (balance vs. expected) is an informational cross-check only.

## Limits

- The judgment is only as good as the page: a price behind JavaScript, a
  login or a cookie wall is not seen ("no price found"); a page that shows a
  member or bundle price may be read as the price. The shop controls which
  domains count, and the identity text decides what "same product" means.
- Shipping, taxes and vouchers are not considered: the guarantee compares the
  listed price with the price shown on the page.
- The GEN price is fixed at listing; refunds are a fraction of what was paid,
  so currency rates never enter.
- A page can change between the leader's and the validators' fetches; then
  they disagree and the transaction does not go through, and the buyer can
  claim again.

## API

| Method | Who | Notes |
|---|---|---|
| `list_product(title, identity, currency, list_price, price_wei, competitors_json, window_seconds)` | shop | identity 20–600 chars; list price in minor units; 1–10 bare domains; window 1 h–90 d |
| `update_listing(product_id, list_price, price_wei, active)` | shop | future purchases only |
| `buy(product_id, refund_to)` payable | buyer | exactly `price_wei`; the shop cannot buy; `refund_to` empty = buyer |
| `claim(purchase_id, competitor_url)` | buyer | before the deadline; up to 3, one match; returns `{outcome, reason, refund}` |
| `release(purchase_id)` | anyone | after the deadline; the rest to the shop |
| `recover(purchase_id, to)` | buyer or shop | re-send that party's failed payment |
| `settle_payout(payout_id, tx_hash, finalize_tx)` | anyone | after the paying transaction finalizes |
| `get_product`, `get_purchase`, `get_claims`, `get_payouts`, `get_counts`, `get_accounting` | view | |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/price_match.py
pytest tests/direct -v                         # 43 tests
# integration, on Bradbury, against the packed code (keys in GL_PK0..1 env vars)
python deploy/shrink.py contracts/price_match.py build/price_match.py --pack
cd tests/integration && gltest . -v -s --network testnet_bradbury
```

The source is 32 KB; Bradbury rejects deploys above ~20 KB of code, so deploy
the output of `deploy/shrink.py` (AST-checked; 8.8 KB packed). CI re-runs the
direct tests against the packed code.

## Tests (43 direct, Bradbury E2E)

- **Listing and buying**: validation of every listing field; exact payment, the shop cannot buy, refund address.
- **Claims**: proportional refund; validators must agree on the exact price, and on every rejected reason (different product, out of stock, other currency, no price, not lower); thousands separators; domain allowlist with subdomains and `www.`; an unavailable page does not use up a claim; truncation is flagged; fenced page text; claim limits and window; malformed model answers.
- **Money**: release after the window; claims and releases revert when the contract cannot pay; delivered and failed settlement; recovery by the right party, to any address, repeatable after another failure; settle rejects another transaction, sender, time, method, purchase or address, a finalization of another transaction, and a call that sent nothing.
- **Bradbury E2E** (`tests/integration`): real validators read books.toscrape.com and real transfers settle, as in the evidence above.

## License

MIT
