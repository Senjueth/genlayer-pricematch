// End-to-end on Testnet Bradbury (Phase 2), on the packed code that is deployed:
//
//   python deploy/shrink.py contracts/price_match.py build/price_match.py --pack
//   npm i genlayer-js@2.0.0-rc.2   # plus the estimateTransactionFees patch in app/README.md
//   GL_PK0=0x... GL_PK1=0x... node tests/integration/bradbury.mjs build/price_match.py [contract]
//
// GL_PK0 is the shop, GL_PK1 the buyer. Runs for about 1.5 hours: the guarantee window is the
// 1-hour minimum, and value transfers execute when each paying transaction finalizes.
//
// The competitor is books.toscrape.com, a public sandbox store with stable pages; validators
// fetch it live. Covers, with real validators and real transfers:
// - product 0 (£60.00): a claim with a different book is rejected; a claim with the same book at
//   £51.77 refunds 823/6000 of the price; a claim on an unlisted domain is refused before any fetch;
// - product 1 (£50.00): the same page is not lower, rejected;
// - a purchase whose refund address rejects value (an EVM contract that always reverts): the
//   refund settles FAILED, the buyer recovers it to their own address, that settles DELIVERED;
// - a purchase whose refund address is a GenLayer contract (GL_CONTRACT_PAYEE, default a deployed
//   test receiver): on Phase 2 the value reaches that contract's account as an external message, no
//   child transaction; it settles DELIVERED from the transfer's own TransactionExecuted log;
// - after the window every escrow is released to the shop; every payout is settled from its own
//   transfer, with the recipient's balance checked in the finalizing block.
// Every transaction carries a fee deposit; a paying one also allocates its payout's gas.
import { readFileSync } from "node:fs";
import { createAccount, createClient, MessageType, encodeExternalMessageFeeParams } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const MILLI = 10n ** 15n, PRICE = 6n * MILLI;
const IDENTITY = "A Light in the Attic by Shel Silverstein (book, new copy). UPC a897fe39b1053632.";
const BOOK = "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"; // £51.77
const OTHER_BOOK = "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html"; // £53.74
const REFUND = (PRICE * (6000n - 5177n)) / 6000n;
const WINDOW = 3600;
const GL_PAYEE = process.env.GL_CONTRACT_PAYEE ?? "0x30EC0dDcf351d29bB25dA7c75C2bCc7E4445cf71";
// Runtime code PUSH1 0 PUSH1 0 REVERT: rejects every call, including plain value.
const REJECTER_INITCODE = "0x6460006000fd6000526005601bf3";
const CONSENSUS_MAIN = "0x2e2766cbc3e5e61ce93bbcdcbb3eacb82082a019";
const T_FINALIZED = "0x24196ec40f90671b7144e716978686b4f3c7d6b00b23da3971ef2b52af27d87f";
const PAYOUT_GAS = 100000n, PAYOUT_GAS_PRICE = 1000000000n;
// rpc.testnet-chain.genlayer.com (the chain default) does not serve gen_call; this one serves the same chain.
const endpoint = "https://rpc-bradbury.genlayer.com";
const a0 = createAccount(process.env.GL_PK0);
const a1 = createAccount(process.env.GL_PK1);
const c0 = createClient({ chain: testnetBradbury, endpoint, account: a0 });
const c1 = createClient({ chain: testnetBradbury, endpoint, account: a1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Read-only calls: the public RPC drops connections now and then, so retry them.
async function retry(f) {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket|not valid JSON|terminated|unknown RPC error/i.test(`${e?.shortMessage} ${e?.details} ${e?.message}`)) throw e;
      await sleep(10000);
    }
  }
}
const fees = (c, payee) => retry(async () => {
  const messageAllocations = payee && [{
    messageType: MessageType.External, onAcceptance: false, recipient: payee, budget: PAYOUT_GAS * PAYOUT_GAS_PRICE,
    callKey: "0x" + "00".repeat(32), feeParams: encodeExternalMessageFeeParams({ gasLimit: PAYOUT_GAS, maxGasPrice: PAYOUT_GAS_PRICE }),
  }];
  const e = await c.estimateTransactionFees(payee ? { messageAllocations } : {});
  return { distribution: e.distribution, feeValue: e.feeValue, ...(payee && { messageAllocations: e.messageAllocations }) };
});
// The public RPC drops connections now and then; retry the wait, never the write.
async function wait(c, hash, waitUntil = "decided") {
  for (let i = 0; ; i++) {
    try {
      return await c.waitForTransactionReceipt({ hash, waitUntil, interval: 10000, retries: 360 });
    } catch (e) {
      if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket|not valid JSON|terminated|unknown RPC error/i.test(`${e?.shortMessage} ${e?.details} ${e?.message}`)) throw e;
      await sleep(10000);
    }
  }
}
const check = (ok, what) => {
  console.log(ok ? "  ok  " : "  FAIL", what);
  if (!ok) process.exit(1);
};
// A leader timeout (NOT_VOTED) executed nothing, so sending the call again is safe. Bradbury still
// moves such a transaction's value into the contract, where get_accounting shows it as unaccounted.
let address, stray = 0n;
async function tx(c, label, functionName, args, { value = 0n, payee } = {}) {
  for (let i = 0; ; i++) {
    const hash = await c.writeContract({ address, functionName, args, value, fees: await fees(c, payee) });
    const r = await wait(c, hash);
    console.log(`${label}: ${hash} ${r.txExecutionResultName}`);
    if (r.txExecutionResultName !== "NOT_VOTED" || i >= 2) return { ...r, hash };
    stray += value;
  }
}
const ok = async (...a) => { const r = await tx(...a); check(r.txExecutionResultName === "FINISHED_WITH_RETURN", `${a[1]} succeeds`); return r; };
const fails = async (what, ...a) => check((await tx(...a)).txExecutionResultName !== "FINISHED_WITH_RETURN", what);
const read = async (functionName, args = []) => {
  const v = await retry(() => c0.readContract({ address, functionName, args }));
  const plain = (x) => (x instanceof Map ? Object.fromEntries([...x].map(([k, y]) => [k, plain(y)])) : Array.isArray(x) ? x.map(plain) : x);
  return plain(v);
};
// RPC nodes behind the edge can lag the one that reported the receipt: re-read until `ok` holds (or give up).
async function settled(fn, args, ok) {
  for (let i = 0; ; i++) {
    const v = await read(fn, args);
    if (ok(v) || i >= 12) return v;
    await sleep(10000);
  }
}
const rpc = async (method, params) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "user-agent": "pricematch-e2e" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      return (await r.json()).result;
    } catch (e) {
      if (i >= 5) throw e;
      await sleep(10000);
    }
  }
};
// The consensus-layer transaction that finalized `hash` and its block: it emits TransactionFinalized(txId).
async function finalizeTx(hash, fromBlock) {
  for (;;) {
    const to = BigInt(await rpc("eth_blockNumber", []));
    for (let b = fromBlock; b <= to; b += 1000n) {
      const end = b + 999n > to ? to : b + 999n;
      const logs = await rpc("eth_getLogs", [{ address: CONSENSUS_MAIN, topics: [T_FINALIZED, hash], fromBlock: "0x" + b.toString(16), toBlock: "0x" + end.toString(16) }]);
      if (logs?.length) return [logs[0].transactionHash, BigInt(logs[0].blockNumber)];
    }
    await sleep(30000);
  }
}
const balance = async (a, block) => BigInt(await rpc("eth_getBalance", [a, "0x" + block.toString(16)]));
// Settle payout `p`, paid by GenLayer tx `hash`, once that finalizes; checks what reached the payee; once only.
async function settle(pid, p, hash, failed, fromBlock) {
  await wait(c0, hash, "finalized");
  const [fin, block] = await finalizeTx(hash, fromBlock);
  const moved = (await balance(p.to, block)) - (await balance(p.to, block - 1n));
  // A payee that also sent the paying transaction gets its unused fee deposit back in the same block.
  check(failed ? moved === 0n : moved >= BigInt(p.amount), `payout ${p.id}: +${moved} wei to ${p.to} in block ${block}`);
  await ok(c1, `settle payout ${p.id}`, "settle_payout", [Number(p.id), hash, fin]);
  const want = failed ? "FAILED" : "DELIVERED";
  const got = await settled("get_payouts", [pid], (x) => x.find((y) => y.id === p.id)?.status === want);
  check(got.find((y) => y.id === p.id).status === want, `payout ${p.id} ${p.kind} -> ${p.to}: ${want}  paid ${hash}  finalized ${fin}`);
  await fails("a payout settles once", c1, "settle again", "settle_payout", [Number(p.id), hash, fin]);
}
async function deployRejecter() {
  const hash = await c0.sendTransaction({ account: a0, data: REJECTER_INITCODE, gas: 100000n });
  for (let i = 0; i < 60; i++) {
    const rc = await rpc("eth_getTransactionReceipt", [hash]);
    if (rc) { check(rc.status === "0x1" && rc.contractAddress, `rejecter ${rc.contractAddress}`); return rc.contractAddress; }
    await sleep(5000);
  }
  check(false, `rejecter deploy ${hash} mined`);
}

address = process.argv[3];
if (!address) {
  const hash = await c0.deployContract({ code: readFileSync(process.argv[2], "utf8"), args: [], fees: await fees(c0) });
  const r = await wait(c0, hash);
  address = r.txDataDecoded?.contractAddress;
  console.log(`deploy: ${hash} ${r.txExecutionResultName} -> ${address}`);
  check(r.txExecutionResultName === "FINISHED_WITH_RETURN", "deployed");
}
const fromBlock = BigInt(await rpc("eth_blockNumber", []));
stray = BigInt((await read("get_accounting")).unaccounted);
const shop = a0.address, buyer = a1.address, paid = [];
const prod = Number((await read("get_counts")).products);
const competitors = '["books.toscrape.com"]';
await ok(c0, "list product (£60.00)", "list_product", ["A Light in the Attic", IDENTITY, "GBP", 6000, PRICE, competitors, WINDOW]);
await ok(c0, "list product (£50.00)", "list_product", ["A Light in the Attic (sale)", IDENTITY, "GBP", 5000, 5n * MILLI, competitors, WINDOW]);
const rejecter = await deployRejecter();

const buy = async (product, value, refundTo = "") => {
  await ok(c1, `buy product ${product}`, "buy", [product, refundTo], { value });
  return Number((await read("get_counts")).purchases) - 1;
};
const claim = async (pid, url, payee) => {
  const r = await ok(c1, `claim ${pid}`, "claim", [pid, url], { payee });
  const c = (await settled("get_claims", [pid], (x) => x.length > 0)).at(-1);
  console.log(`    claim ${pid}: ${c.outcome} (${c.reason}) price=${c.price} quote=${JSON.stringify(c.quote)} sha=${c.page_sha256.slice(0, 12)}`);
  if (c.outcome === "matched" && BigInt(c.refund)) paid.push([r.hash, pid, (await read("get_payouts", [pid])).at(-1)]);
  return c;
};

// Claims are judged from the competitor's page.
const p0 = await buy(prod, PRICE);
let c = await claim(p0, OTHER_BOOK, buyer);
check(c.outcome === "rejected" && c.reason === "not the same product", "a different book is rejected");
c = await claim(p0, BOOK, buyer);
check(c.outcome === "matched" && Number(c.price) === 5177 && BigInt(c.refund) === REFUND, "same book at £51.77 refunds 823/6000");
let pu = await read("get_purchase", [p0]);
check(BigInt(pu.held) === PRICE - REFUND && Number(pu.claims_left) === 0, "held = price - refund, no claims left");
const p1 = await buy(prod + 1, 5n * MILLI);
await fails("a domain the shop did not list is refused", c1, "claim off-list", "claim", [p1, "https://www.example.com/a-light-in-the-attic"]);
c = await claim(p1, BOOK, buyer);
check(c.outcome === "rejected" && c.reason === "not lower than the price paid", "not lower is rejected");
check(BigInt((await read("get_purchase", [p1])).held) === 5n * MILLI, "nothing refunded");
// A refund to an address that rejects value.
const p2 = await buy(prod, PRICE, rejecter);
c = await claim(p2, BOOK, rejecter);
check(c.outcome === "matched", "refund to the rejecting address sent");
// A refund to a GenLayer contract.
const p3 = await buy(prod, PRICE, GL_PAYEE);
c = await claim(p3, BOOK, GL_PAYEE);
check(c.outcome === "matched", "refund to the GenLayer contract sent");

// Release after the window.
const deadline = Math.max(...(await Promise.all([p0, p1, p2, p3].map((p) => read("get_purchase", [p])))).map((x) => Number(x.deadline)));
console.log(`waiting for the window to close (${new Date(deadline * 1000).toISOString()})`);
while (Date.now() / 1000 < deadline + 120) await sleep(60000);
for (const p of [p0, p1, p2, p3]) {
  const r = await ok(c0, `release ${p}`, "release", [p], { payee: shop });
  paid.push([r.hash, p, (await settled("get_payouts", [p], (x) => x.at(-1)?.kind === "release")).at(-1)]);
  check((await read("get_purchase", [p])).released, `purchase ${p} released`);
}

// Every payout settles from its own transfer.
for (const [hash, pid, p] of paid) await settle(pid, p, hash, p.to.toLowerCase() === rejecter.toLowerCase(), fromBlock);
check(BigInt((await read("get_purchase", [p2])).buyer_recoverable) === REFUND, "the failed refund is the buyer's to recover");
const rec = await ok(c1, "recover", "recover", [p2, buyer], { payee: buyer });
const rp = (await settled("get_payouts", [p2], (x) => x.at(-1)?.kind === "recover")).at(-1);
check(rp.kind === "recover" && BigInt(rp.amount) === REFUND, "recover payout = refund");
await settle(p2, rp, rec.hash, false, fromBlock);
const acc = await read("get_accounting");
check(BigInt(acc.unaccounted) === stray, `balance matches what the contract expects to hold (+${stray} from unexecuted txs)`);
console.log("contract", address, "rejecter", rejecter);
