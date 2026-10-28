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
Testnet Bradbury (chainId 4221): [`0x596Ea3d8FB24963D2fb17FB081bAF97Bc172d94E`](https://scan.testnet-chain.genlayer.com/address/0x596Ea3d8FB24963D2fb17FB081bAF97Bc172d94E)

## Bradbury evidence

Bradbury Phase 2 (GenVM v0.3). Run by [`tests/integration/bradbury.mjs`](tests/integration/bradbury.mjs), every check passed; the run was resumed after the window on the same contract when the public RPC dropped connections. Contract `0x596Ea3d8FB24963D2fb17FB081bAF97Bc172d94E` (deploy [`0xd78f2ad5…`](https://scan.testnet-chain.genlayer.com/tx/0xd78f2ad5676c9877ef279511bfab6cea8e3f75f6469c7cf33d2e9d765f27e868)), code `build/price_match.py` (sha256 `afb368c6…`). Shop and buyer are separate accounts; validators fetched the pages live. Every claim stores the page's SHA-256: the same book's page hashed `a6e572bec156…` in all four claims.

| Purchase | Step | Transaction | Outcome |
|---|---|---|---|
|  | list product 0: £60.00, 0.006 GEN, competitor books.toscrape.com, 1 h window | [`0x1f2a0a3c…`](https://scan.testnet-chain.genlayer.com/tx/0x1f2a0a3c980e668848758143156c10f989e489472d7e5694817d775e66dddd95) | ok |
|  | list product 1: same book at £50.00, 0.005 GEN | [`0x1b7b56eb…`](https://scan.testnet-chain.genlayer.com/tx/0x1b7b56ebb8648c38d02150f342568a068e23698fa0de6b387110e8c619576dc6) | ok |
| #0 | buy product 0 | [`0x5d4cb4ac…`](https://scan.testnet-chain.genlayer.com/tx/0x5d4cb4acff87d25f226612be68239e3f0ffbfe98740b0c779dff4749c4d4a217) | 0.006 GEN in escrow |
| #0 | claim with another book's page (£53.74) | [`0xa1800fee…`](https://scan.testnet-chain.genlayer.com/tx/0xa1800feef91883d5193c877ac3c5d9eb76ec705fcf73e62aef5b91ac0430952a) | rejected: **not the same product** |
| #0 | claim with the same book's page (£51.77) | [`0x703faafb…`](https://scan.testnet-chain.genlayer.com/tx/0x703faafb0144cdc89c35d96221e25a27958da07e575b88aaeaa959721837c97c) | **matched**: refund 823/6000 of the price = 0.000823 GEN (payout 0); resent after a leader timeout ([`0x989b60f7…`](https://scan.testnet-chain.genlayer.com/tx/0x989b60f709793a1fe45e11e3e8859be59eb7927b96f49fee5302d93222c69b1a), NOT_VOTED) |
| #1 | buy product 1 | [`0xe10dbc9d…`](https://scan.testnet-chain.genlayer.com/tx/0xe10dbc9d80e79f1684bd1392560fdb7e6fd5d16967859f23608ba7747df78b9a) | 0.005 GEN in escrow |
| #1 | claim on example.com | [`0x599ee8e8…`](https://scan.testnet-chain.genlayer.com/tx/0x599ee8e8d07dc88292390a254fa8698fa86ddce427d43d4eb308434f12fefdc1) | reverted before any fetch: domain not listed |
| #1 | claim with the same book's page | [`0xb329cbcd…`](https://scan.testnet-chain.genlayer.com/tx/0xb329cbcd9e2a87c141a9751d2fe867b9e718b4ddf4c786225fb8c3b47050711b) | rejected: **not lower than the price paid** |
| #2 | buy product 0, refund to an EVM contract that rejects value (`0xd69b0a93…`) | [`0xd181c72d…`](https://scan.testnet-chain.genlayer.com/tx/0xd181c72d2508c774e48c1c57bdc2c8d476cd8b003b06c791d8250a4aa8e7384e) | 0.006 GEN in escrow |
| #2 | claim with the same book's page | [`0xb0c198f2…`](https://scan.testnet-chain.genlayer.com/tx/0xb0c198f2f775ef0571912f3bf80e8262f78365506904a8fee40a487ce3ad87d9) | **matched**: refund 0.000823 GEN to the rejecter (payout 1) |
| #3 | buy product 0, refund to a GenLayer contract (`0x30EC0dDc…`) | [`0x46987496…`](https://scan.testnet-chain.genlayer.com/tx/0x469874969555c4df40fc2c630d61bc0597972a916edcd116b6af557120c3d1c0) | 0.006 GEN in escrow |
| #3 | claim with the same book's page | [`0xe68d5233…`](https://scan.testnet-chain.genlayer.com/tx/0xe68d5233d5735b6d3fc778e8f1b20b04c7a85893860fc8022dfa57cbe75e69fb) | **matched**: refund 0.000823 GEN to the GenLayer contract (payout 2) |
| #0–#3 | release each after the window | [`0xb07d0f71…`](https://scan.testnet-chain.genlayer.com/tx/0xb07d0f716a6f72ff5acd8271d2ab86d2f2e313974bcd43d139cd8b4e024356e5) | payouts 3–6 to the shop (also [`0x54a04dcd…`](https://scan.testnet-chain.genlayer.com/tx/0x54a04dcd742f3e3921a2992a838b4b30c3abfc3c203b0af046b2553f6d504575), [`0x18aefc68…`](https://scan.testnet-chain.genlayer.com/tx/0x18aefc68dda79bea2f7cb9df661844680c60e58a9aafefe754d5b5d2b45650b9), [`0xdd1eb72f…`](https://scan.testnet-chain.genlayer.com/tx/0xdd1eb72f95ba6c0fbaf77f3d30b735f4cba663eb07c4e15c61f503b3f5a465c9)) |
| #2 | buyer recovers the failed refund to their own address | [`0xe51c77a3…`](https://scan.testnet-chain.genlayer.com/tx/0xe51c77a35ba53134ac20f59dce6f3e750f71b56849da27b6e1095649b732468e) | payout 7 |

Each payout settled from its own transfer after the paying transaction finalized. Balance change is the recipient's `eth_getBalance` at the finalizing block minus the block before, checked by the test (* the recipient also sent the paying transaction, so the same block returns its unused fee deposit; the change is the payout plus that refund):

| Payout | Kind | Paid by | Finalized by (block) | Recipient balance | `settle_payout` | Result |
|---|---|---|---|---|---|---|
| 0 | refund → buyer | [`0x703faafb…`](https://scan.testnet-chain.genlayer.com/tx/0x703faafb0144cdc89c35d96221e25a27958da07e575b88aaeaa959721837c97c) | [`0x0c7dedd2…`](https://scan.testnet-chain.genlayer.com/tx/0x0c7dedd2b7eb4dcd4a84ebfb43897fcd080bdfb39067232f49ccb0b095017210) (189739) | +0.000823 GEN* | [`0x44fc1419…`](https://scan.testnet-chain.genlayer.com/tx/0x44fc1419cec9353b3f624080153c10dac884cba05972168e2f4869ca5bbeacf0) | DELIVERED |
| 1 | refund → EVM rejecter | [`0xb0c198f2…`](https://scan.testnet-chain.genlayer.com/tx/0xb0c198f2f775ef0571912f3bf80e8262f78365506904a8fee40a487ce3ad87d9) | [`0xef53196e…`](https://scan.testnet-chain.genlayer.com/tx/0xef53196e1ea428b01a72cd5f24e03b15ffc89dc96a4c3024777afafc7338c9a1) (189864) | 0 GEN | [`0x84d1dd15…`](https://scan.testnet-chain.genlayer.com/tx/0x84d1dd15e14019e918f3f2527cfd7bdebbee2566e4195b60a1cad6fd4688c908) | FAILED: recoverable by the buyer |
| 2 | refund → GenLayer contract | [`0xe68d5233…`](https://scan.testnet-chain.genlayer.com/tx/0xe68d5233d5735b6d3fc778e8f1b20b04c7a85893860fc8022dfa57cbe75e69fb) | [`0xbf60a070…`](https://scan.testnet-chain.genlayer.com/tx/0xbf60a0704317d2d2c3678e6555dc6485f8aaf97b2087de28e4163735bc48bf87) (189888) | +0.000823 GEN | [`0x4611a3f3…`](https://scan.testnet-chain.genlayer.com/tx/0x4611a3f31f9bcc5ce8e21c2832d4c739e8a07d3d4d5d547219e304d72827b4f2) | DELIVERED |
| 3 | release #0 → shop | [`0xb07d0f71…`](https://scan.testnet-chain.genlayer.com/tx/0xb07d0f716a6f72ff5acd8271d2ab86d2f2e313974bcd43d139cd8b4e024356e5) | [`0xf7af65f7…`](https://scan.testnet-chain.genlayer.com/tx/0xf7af65f7b616aead943693cef371bd0172271add89a6761c70126a5d0f63ea0d) (190016) | +0.005177 GEN* | [`0x385525b8…`](https://scan.testnet-chain.genlayer.com/tx/0x385525b804bfc4a8fc524da9927671ee3219414463df1f80a5af25dfb29d16be) | DELIVERED |
| 4 | release #1 → shop | [`0x54a04dcd…`](https://scan.testnet-chain.genlayer.com/tx/0x54a04dcd742f3e3921a2992a838b4b30c3abfc3c203b0af046b2553f6d504575) | [`0x8ed77fb8…`](https://scan.testnet-chain.genlayer.com/tx/0x8ed77fb89c19b97c71a05e2f5a389c24324503422f3d7232e325565fe1c19707) (190032) | +0.005 GEN* | [`0xd73e9cd6…`](https://scan.testnet-chain.genlayer.com/tx/0xd73e9cd61723bd6f44c823d16786e8df8c02fad2a00067ab9defef77bc2d66f2) | DELIVERED |
| 5 | release #2 → shop | [`0x18aefc68…`](https://scan.testnet-chain.genlayer.com/tx/0x18aefc68dda79bea2f7cb9df661844680c60e58a9aafefe754d5b5d2b45650b9) | [`0xff7d1a26…`](https://scan.testnet-chain.genlayer.com/tx/0xff7d1a26b729229e314d59ad281a1e6005643e69d6ea1f1704e1f6c1c43eecaa) (190054) | +0.005177 GEN* | [`0x180cf6ee…`](https://scan.testnet-chain.genlayer.com/tx/0x180cf6eeee9a655cc6b7083e3d844eab3aa7f29607267a1cdb20bddff3ecd254) | DELIVERED |
| 6 | release #3 → shop | [`0xdd1eb72f…`](https://scan.testnet-chain.genlayer.com/tx/0xdd1eb72f95ba6c0fbaf77f3d30b735f4cba663eb07c4e15c61f503b3f5a465c9) | [`0x8c6f2b73…`](https://scan.testnet-chain.genlayer.com/tx/0x8c6f2b73870a25c0bafc4ca7da6f9b2482a6a4e6c4d5121358596ac784c84636) (190063) | +0.005177 GEN* | [`0xf4a15527…`](https://scan.testnet-chain.genlayer.com/tx/0xf4a1552783901362c4d8dc53954754c060f337680b3a26fe5067fda068f09320) | DELIVERED |
| 7 | recover → buyer | [`0xe51c77a3…`](https://scan.testnet-chain.genlayer.com/tx/0xe51c77a35ba53134ac20f59dce6f3e750f71b56849da27b6e1095649b732468e) | [`0x5ad164a9…`](https://scan.testnet-chain.genlayer.com/tx/0x5ad164a9492363a07351d6345f867a3138c16278f58a9ef9546db57de63ca92f) (190417) | +0.000823 GEN* | [`0x7417df7b…`](https://scan.testnet-chain.genlayer.com/tx/0x7417df7b6ccea7013d9c9e35efaf0465cf7b322602e3d73adb6c3634d4d4fb9e) | DELIVERED |

Payout 2 went to a GenLayer contract: on Phase 2 it is an external message like any other, no child transaction is created, and it settled DELIVERED from the transfer's `TransactionExecuted` log. Settling the same payout again is rejected each time ([`0x8b107930…`](https://scan.testnet-chain.genlayer.com/tx/0x8b107930631edd5e0243ee7de9be4006772830da79534a6c85b236bba9e9fcd8), [`0x9360cc51…`](https://scan.testnet-chain.genlayer.com/tx/0x9360cc51fb91141ceab6d5a9a77d0d1321008a54c79a0389fba87f539c696c8e), [`0xfa5a7f98…`](https://scan.testnet-chain.genlayer.com/tx/0xfa5a7f983b363557a863c1d1d8d384e4c7b9e4dea10c0eaa6f711185b14988db), [`0x54f136c3…`](https://scan.testnet-chain.genlayer.com/tx/0x54f136c3ededfb1e2fa2fbf29e4ea729962ef7d7db29feb4a196c26d8f067757), [`0x0d986029…`](https://scan.testnet-chain.genlayer.com/tx/0x0d9860297a80c38fbd59d02657e3b1a9c902f9266b268e86f05d28f37eeb5f85), [`0x26c15833…`](https://scan.testnet-chain.genlayer.com/tx/0x26c15833f09e53acf72be6747a21849e950bb122c1f2307b15b9d81687b0e243), [`0xe1c4f120…`](https://scan.testnet-chain.genlayer.com/tx/0xe1c4f1202981e3012b50c39f43f8c1799789e5673305f13345cb0edb5ae2ebff)). Afterwards `get_accounting` reports `unaccounted: 0`.

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
  4. A payee that is a GenLayer contract receives the transfer in its own
     child transaction (ConsensusMain's `InternalMessageProcessed(tx_hash,
     child, payee)`). Validators then read the child: it must be to the
     payee and finalized; **DELIVERED** only if it finished with a return,
     otherwise **FAILED** and recoverable by the payee as below.
     On Bradbury Phase 2 no child is created: every payout is an external
     message, a GenLayer-contract payee receives the value on its account
     (its `__receive__` is not run), and step 3 settles it. Checked live:
     [`0x2d8cf8fd…`](https://scan.testnet-chain.genlayer.com/tx/0x2d8cf8fdb1bca3d73a205a8946e2aef917692cdaeda97fe1ba0803caaee932a1)
     paid 1000 wei to contract `0x30EC0dDc…`, finalized in
     [`0x5eb8b667…`](https://scan.testnet-chain.genlayer.com/tx/0x5eb8b6678e7027e974c3073fbd43540e1878e0275db961ad78027d5c3fa3c9a6)
     with `TransactionExecuted` and no `InternalMessageProcessed`.
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
pytest tests/direct -v                         # 47 tests
# integration, on Bradbury, against the packed code (keys in GL_PK0..1 env vars, ~1.5 h)
python deploy/shrink.py contracts/price_match.py build/price_match.py --pack
npm i genlayer-js@2.0.0-rc.2   # plus the fee-estimate patch in app/README.md
node tests/integration/bradbury.mjs build/price_match.py
```

The source is 32 KB; Bradbury rejects deploys above ~20 KB of code, so deploy
the output of `deploy/shrink.py` (AST-checked; 9.3 KB packed). CI re-runs the
direct tests against the packed code.

## Tests (47 direct, Bradbury E2E)

- **Listing and buying**: validation of every listing field; exact payment, the shop cannot buy, refund address.
- **Claims**: proportional refund; validators must agree on the exact price, and on every rejected reason (different product, out of stock, other currency, no price, not lower); thousands separators; domain allowlist with subdomains and `www.`; an unavailable page does not use up a claim; truncation is flagged; fenced page text; claim limits and window; malformed model answers.
- **Money**: release after the window; claims and releases revert when the contract cannot pay; delivered and failed settlement, including a payee that is a GenLayer contract (settled from its child transaction: delivered, failed and recoverable by the payee, not yet finalized, to another address); recovery by the right party, to any address, repeatable after another failure; settle rejects another transaction, sender, time, method, purchase or address, a finalization of another transaction, and a call that sent nothing.
- **Bradbury E2E** (`tests/integration/bradbury.mjs`): real validators read books.toscrape.com and real transfers settle (to a wallet, an EVM contract that rejects value, and a GenLayer contract), as in the evidence above.

## License

MIT
