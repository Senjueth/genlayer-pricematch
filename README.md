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

App: [pricematch.senju.quest](https://pricematch.senju.quest) (source in [`app/`](app/): products, purchases, claims with what validators read, payouts, every role's actions)  
Testnet Bradbury (chainId 4221): [`0xAc41a8F5Bd4ACB53127f6719aE08a691903D096b`](https://explorer-bradbury.genlayer.com/address/0xAc41a8F5Bd4ACB53127f6719aE08a691903D096b)

## Bradbury evidence

Run by [`tests/integration/test_price_match.py`](tests/integration/test_price_match.py) (6 passed, 2 h 27 min). Contract `0xAc41a8F5Bd4ACB53127f6719aE08a691903D096b` (deploy [`0x1c473582…`](https://explorer-bradbury.genlayer.com/tx/0x1c4735825d9a326430bd41fd5fb101e4b093bc2bce431f5a41d89d9a23939d33)), code `build/price_match.py` (sha256 `5a7fab01…`). Shop and buyer are separate accounts; validators fetched the pages live. Every claim stores the page's SHA-256: the same book's page hashed `a6e572bec156…` in all three claims.

| Purchase | Step | Transaction | Outcome |
|---|---|---|---|
|  | list product 0: £60.00, 0.006 GEN, competitor books.toscrape.com, 1 h window | [`0xe7fb4360…`](https://explorer-bradbury.genlayer.com/tx/0xe7fb436094b10f2677fca2f494e46d46735e84ef4de6ac2cb29a9fef735ad043) | ok |
|  | list product 1: same book at £50.00, 0.005 GEN | [`0x3662e3e3…`](https://explorer-bradbury.genlayer.com/tx/0x3662e3e305c67b4bfac5e117c5833dca401973fdbb2c44dc0e1526dd6ee9e591) | ok |
| #0 | buy product 0 | [`0xbece5036…`](https://explorer-bradbury.genlayer.com/tx/0xbece50368c084169bac59d35565184455cddae972e4cc7ece8f46284c94e37f9) | 0.006 GEN in escrow |
| #0 | claim with another book's page (£53.74) | [`0x96ad4e24…`](https://explorer-bradbury.genlayer.com/tx/0x96ad4e24c3f11d78cd6c0e33d3930186e6b1924bc29b51fc3054cb692617b18e) | rejected: **not the same product** |
| #0 | claim with the same book's page (£51.77) | [`0x55aae771…`](https://explorer-bradbury.genlayer.com/tx/0x55aae77158a4347a6ab742c8a14710fac8a7e85e403e1634c9b4e7d0a12ec34f) | **matched**: refund 823/6000 of the price = 0.000823 GEN (payout 0) |
| #1 | buy product 1 | [`0xc9c8a319…`](https://explorer-bradbury.genlayer.com/tx/0xc9c8a31933233ebc33f2e9e2c696ff42ad44656c200c0863ca43029eede6363e) | 0.005 GEN in escrow |
| #1 | claim on example.com | [`0x25d836b5…`](https://explorer-bradbury.genlayer.com/tx/0x25d836b589c4895e2df56532a016dc5f25d0feca70a4988158995a8db9cb7e7b) | reverted before any fetch: domain not listed |
| #1 | claim with the same book's page | [`0xe3982e22…`](https://explorer-bradbury.genlayer.com/tx/0xe3982e221b083ad4e855853a215896882f3bbcfb70a0713b17d3c08d14c5e906) | rejected: **not lower than the price paid** |
| #2 | buy product 0, refund to a contract that rejects value | [`0xd154d079…`](https://explorer-bradbury.genlayer.com/tx/0xd154d0799e7ae1d4e7dfa0473755f6de98fe50d08203e5401494dca3f34803ee) | 0.006 GEN in escrow |
| #2 | claim with the same book's page | [`0x26dab9a1…`](https://explorer-bradbury.genlayer.com/tx/0x26dab9a14439593378ec2c635f16de2b2241e8433ed33b0874334928517a08f7) | **matched**: refund 0.000823 GEN to the rejecter (payout 1) |
|  | release #0, #1, #2 after the window | [`0x6362ee76…`](https://explorer-bradbury.genlayer.com/tx/0x6362ee763c524d38d61401d12de4477e34a38f74189e345ef7dd918b59aae7dd) | payouts 2–4 to the shop (also [`0x60293134…`](https://explorer-bradbury.genlayer.com/tx/0x6029313495dad38fc102901bdb5f22b38c22f41aaee925348034e554e842367c), [`0x0a3473b9…`](https://explorer-bradbury.genlayer.com/tx/0x0a3473b97abf320770549c4d27739ec335526969ff76b377b75121d50b27de53)) |
| #2 | buyer recovers the failed refund to their own address | [`0x02db83f4…`](https://explorer-bradbury.genlayer.com/tx/0x02db83f4128da0135be3159093e4737057687a72044fa7d95a566e06dce1a3c7) | payout 5 |

Each payout settled from its own transfer after the paying transaction finalized. Balance change is the recipient's `eth_getBalance` at the finalizing block minus the block before, checked by the test:

| Payout | Kind | Paid by | Finalized by (block) | Recipient balance | `settle_payout` | Result |
|---|---|---|---|---|---|---|
| 0 | refund → buyer | [`0x55aae771…`](https://explorer-bradbury.genlayer.com/tx/0x55aae77158a4347a6ab742c8a14710fac8a7e85e403e1634c9b4e7d0a12ec34f) | [`0xe91f11ad…`](https://explorer-bradbury.genlayer.com/tx/0xe91f11ad2d910c3657c4abd5e050b016de93c038f3e37f81e7e0d080a161d111) (25537712) | +0.000823 GEN | [`0xe598807f…`](https://explorer-bradbury.genlayer.com/tx/0xe598807f471fe4352a1cb5c537de2a1ae620973a192985222bcd1a69dcdac668) | DELIVERED |
| 1 | refund → rejecter | [`0x26dab9a1…`](https://explorer-bradbury.genlayer.com/tx/0x26dab9a14439593378ec2c635f16de2b2241e8433ed33b0874334928517a08f7) | [`0xca6930b7…`](https://explorer-bradbury.genlayer.com/tx/0xca6930b748a73595bb839e8818fc858690b08d9ad77923e80410aa5c36513808) (25538034) | 0 GEN | [`0xa8435ebf…`](https://explorer-bradbury.genlayer.com/tx/0xa8435ebf979ec4e85d7ec7e08d321dfbfd2844bd338e5bc30a439b4d4fd1354b) | FAILED: recoverable by the buyer |
| 2 | release #0 → shop | [`0x6362ee76…`](https://explorer-bradbury.genlayer.com/tx/0x6362ee763c524d38d61401d12de4477e34a38f74189e345ef7dd918b59aae7dd) | [`0x7b5e2d47…`](https://explorer-bradbury.genlayer.com/tx/0x7b5e2d47c8bdca31c8ff1c78b1ab1824a8572812ac0d1c05f59f89dddcbe6afd) (25540564) | +0.005177 GEN | [`0x1ef30ed7…`](https://explorer-bradbury.genlayer.com/tx/0x1ef30ed741aab3e080bf8045b7cbb6a35bc4becade9309039166b938394e47d3) | DELIVERED |
| 3 | release #1 → shop | [`0x60293134…`](https://explorer-bradbury.genlayer.com/tx/0x6029313495dad38fc102901bdb5f22b38c22f41aaee925348034e554e842367c) | [`0x41c11b14…`](https://explorer-bradbury.genlayer.com/tx/0x41c11b14735f282117fa22a55b3caf47c01e4e536cd157137aa0e5b6fa12a542) (25540580) | +0.005 GEN | [`0x438b298b…`](https://explorer-bradbury.genlayer.com/tx/0x438b298bdb5b96468a86114df165f6e8678cbcd3eabf35654e50a83b33229f72) | DELIVERED |
| 4 | release #2 → shop | [`0x0a3473b9…`](https://explorer-bradbury.genlayer.com/tx/0x0a3473b97abf320770549c4d27739ec335526969ff76b377b75121d50b27de53) | [`0x6a8e44c8…`](https://explorer-bradbury.genlayer.com/tx/0x6a8e44c8aa7f315483a8624f176b1aaea8c1ac7b6fe37aa032b49019a465fdc7) (25540595) | +0.005177 GEN | [`0xd7d121c7…`](https://explorer-bradbury.genlayer.com/tx/0xd7d121c76b255c3747875f3f6dad6266fbbea861621a50424fa33336a74271e7) | DELIVERED |
| 5 | recover → buyer | [`0x02db83f4…`](https://explorer-bradbury.genlayer.com/tx/0x02db83f4128da0135be3159093e4737057687a72044fa7d95a566e06dce1a3c7) | [`0xee06ec7b…`](https://explorer-bradbury.genlayer.com/tx/0xee06ec7bb38014124231639f9a2beb1c82d3ec76b89516ce51b29c81b85e5490) (25542906) | +0.000823 GEN | [`0xe9824ebf…`](https://explorer-bradbury.genlayer.com/tx/0xe9824ebf990e3f7f711f59f7a726cd7407708b79d542d85f47bfeabe55b118a1) | DELIVERED |

Settling the same payout again is rejected each time ([`0x1c213f9e…`](https://explorer-bradbury.genlayer.com/tx/0x1c213f9e8d1b2beb44b5f0da7093ad4d4da9cb2de98069c229188a748ad5ded0), [`0x1d191f17…`](https://explorer-bradbury.genlayer.com/tx/0x1d191f173e1bb64ea95d42a9ad30ce1dc637739551161f18befd2225d632a3cb), [`0xacc91433…`](https://explorer-bradbury.genlayer.com/tx/0xacc9143390b51490f76b47db3e9ffa9813f65eeeb8d7739724b388c20d13b174), [`0x417b8107…`](https://explorer-bradbury.genlayer.com/tx/0x417b8107496ebac9e98ba40b20dcca707b8470111d7017900d05c1aeb0437872), [`0x20034b0c…`](https://explorer-bradbury.genlayer.com/tx/0x20034b0c1af7ad354db74d45719d2e7e9fb7ad7b7671f8a0a552383b97e37b99), [`0x473365fe…`](https://explorer-bradbury.genlayer.com/tx/0x473365fe5a4a835adf6f1f65ce714224484e0c3126d8e7992bf86e83d99c36e0)). Afterwards `get_accounting` reports expected balance 0, `unaccounted: 0`.

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
