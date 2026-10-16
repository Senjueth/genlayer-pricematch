"""End-to-end on Testnet Bradbury, on the packed code that is deployed:

    python deploy/shrink.py contracts/price_match.py build/price_match.py --pack
    cd tests/integration && gltest . -v -s --network testnet_bradbury   # config in this folder

Accounts: GL_PK0 shop, GL_PK1 buyer. Runs for about 1.5 hours: the guarantee
window is the 1-hour minimum, and value transfers execute when each paying
transaction finalizes.

The competitor is books.toscrape.com, a public sandbox store with stable pages;
validators fetch it live. Covers, with real validators and real transfers:
- product 0 (£60.00): a claim with a different book is rejected; a claim with
  the same book at £51.77 refunds 823/6000 of the price; a claim on an unlisted
  domain is refused before any fetch;
- a purchase whose refund address rejects value: the refund settles FAILED,
  the buyer recovers it to their own address, that settles DELIVERED;
- product 1 (£50.00): the same page is not lower, rejected;
- after the window every escrow is released to the shop; every payout is
  settled from its own transfer, with the recipient's balance checked in the
  finalizing block.
"""

import time

import pytest
from eth_account import Account
from gltest import get_accounts

from . import bradbury
from .bradbury import balance, deploy, finalization, ok, reverted, rpc, send

CHAIN_ID = 4221

MILLI = 10**15
PRICE = 6 * MILLI
IDENTITY = "A Light in the Attic by Shel Silverstein (book, new copy). UPC a897fe39b1053632."
BOOK = "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"  # £51.77
OTHER_BOOK = "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html"  # £53.74
REFUND = PRICE * (6000 - 5177) // 6000
WINDOW = 3_600
# Runtime code PUSH1 0 PUSH1 0 REVERT: rejects every call, including plain value.
REJECTER_INITCODE = "0x6460006000fd6000526005601bf3"

S = {}  # state shared by the ordered steps below


def view(fn, args=()):
    return bradbury.view(S["c"], fn, args)


def deploy_rejecter(key):
    acct = Account.from_key(key)
    tx = {
        "chainId": CHAIN_ID,
        "nonce": int(rpc("eth_getTransactionCount", [acct.address, "pending"]), 16),
        "gas": 100_000,
        "gasPrice": int(rpc("eth_gasPrice", []), 16),
        "data": REJECTER_INITCODE,
        "value": 0,
    }
    h = rpc("eth_sendRawTransaction", ["0x" + acct.sign_transaction(tx).raw_transaction.hex().removeprefix("0x")])
    for _ in range(60):
        rc = rpc("eth_getTransactionReceipt", [h])
        if rc:
            assert rc["status"] == "0x1" and rc["contractAddress"], rc
            return rc["contractAddress"]
        time.sleep(5)
    raise AssertionError(f"rejecter deploy {h} not mined")


def buy(product_id, value, refund_to=""):
    ok(S["buyer_c"].buy(args=[product_id, refund_to]).transact(value=value))
    return view("get_counts")["purchases"] - 1


def claim(purchase_id, url):
    tx = send(lambda: S["buyer_c"].claim(args=[purchase_id, url]).transact(wait_interval=10_000, wait_retries=60))
    c = view("get_claims", [purchase_id])[-1]
    print(f"  claim {purchase_id}: {c['outcome']} ({c['reason']}) price={c['price']} quote={c['quote']!r} sha={c['page_sha256'][:12]}")
    pays = view("get_payouts", [purchase_id])
    if c["outcome"] == "matched" and c["refund"]:
        S["paid"].append((purchase_id, tx, pays[-1]))
    return c


pytestmark = pytest.mark.integration


def test_setup():
    S["shop"], buyer = get_accounts()[:2]
    S["buyer"] = buyer.address
    S["c"] = deploy("PriceMatch", "price_match.py")
    S["buyer_c"] = S["c"].connect(buyer)
    S["paid"] = []
    competitors = '["books.toscrape.com"]'
    ok(S["c"].list_product(args=["A Light in the Attic", IDENTITY, "GBP", 6000, PRICE, competitors, WINDOW]).transact())
    ok(S["c"].list_product(args=["A Light in the Attic (sale)", IDENTITY, "GBP", 5000, 5 * MILLI, competitors, WINDOW]).transact())
    S["rejecter"] = deploy_rejecter(S["shop"].key.hex())
    print("rejecter", S["rejecter"])


def test_claims_are_judged_from_the_competitor_page():
    S["p0"] = buy(0, PRICE)
    c = claim(S["p0"], OTHER_BOOK)
    assert c["outcome"] == "rejected" and c["reason"] == "not the same product", c
    c = claim(S["p0"], BOOK)
    assert c["outcome"] == "matched" and c["price"] == 5177 and c["refund"] == REFUND, c
    pu = view("get_purchase", [S["p0"]])
    assert pu["held"] == PRICE - REFUND and pu["claims_left"] == 0
    # A domain the shop did not list is refused before any fetch.
    S["p1"] = buy(1, 5 * MILLI)
    assert reverted(S["buyer_c"].claim(args=[S["p1"], "https://www.example.com/a-light-in-the-attic"]).transact())


def test_not_lower_is_rejected():
    c = claim(S["p1"], BOOK)
    assert c["outcome"] == "rejected" and c["reason"] == "not lower than the price paid", c
    assert view("get_purchase", [S["p1"]])["held"] == 5 * MILLI


def test_refund_to_a_rejecting_address():
    S["p2"] = buy(0, PRICE, S["rejecter"])
    c = claim(S["p2"], BOOK)
    assert c["outcome"] == "matched", c


def test_release_after_the_window():
    deadline = max(view("get_purchase", [p])["deadline"] for p in (S["p0"], S["p1"], S["p2"]))
    while time.time() < deadline + 120:
        time.sleep(60)
    for p in (S["p0"], S["p1"], S["p2"]):
        tx = ok(S["c"].release(args=[p]).transact())
        S["paid"].append((p, tx, view("get_payouts", [p])[-1]))
        assert view("get_purchase", [p])["released"]


def _settle(p, tx, failed):
    fin, block = finalization(tx)
    moved = balance(p["to"], block) - balance(p["to"], block - 1)
    assert moved == (0 if failed else p["amount"]), (p, fin, moved)
    send(lambda: S["c"].settle_payout(args=[p["id"], tx, fin]).transact(wait_interval=10_000, wait_retries=60))
    got = next(x for i in range(view("get_counts")["purchases"]) for x in view("get_payouts", [i]) if x["id"] == p["id"])
    assert got["status"] == ("FAILED" if failed else "DELIVERED") and got["tx"] == tx.lower(), got
    print(f"payout {p['id']} {p['kind']} -> {p['to']}: {got['status']}  paid {tx}  finalized {fin} (block {block}, +{moved} wei)")
    assert reverted(S["c"].settle_payout(args=[p["id"], tx, fin]).transact())


def test_every_payout_settles_from_its_own_transfer():
    for _, tx, p in S["paid"]:
        _settle(p, tx, p["to"].lower() == S["rejecter"].lower())
    # The failed refund is the buyer's to recover, to an address that accepts it.
    assert view("get_purchase", [S["p2"]])["buyer_recoverable"] == REFUND
    tx = ok(S["buyer_c"].recover(args=[S["p2"], S["buyer"]]).transact())
    p = view("get_payouts", [S["p2"]])[-1]
    assert p["kind"] == "recover" and p["amount"] == REFUND
    _settle(p, tx, False)
    acc = view("get_accounting")
    assert acc["expected_balance"] == 0 and acc["unaccounted"] == 0, acc
