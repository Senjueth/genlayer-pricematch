// Asserts which PriceMatch app controls appear per purchase state and role (run: node app/check-actions.mjs app/index.html).
import { readFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const js = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const body = js.slice(js.indexOf("function actions"), js.indexOf("async function show"));
const esc = (s) => String(s ?? "");
const gen = (w, d = 4) => (Number(w) / 1e18).toFixed(d).replace(/\.?0+$/, "");
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const make = new Function("esc", "gen", "same", "ctx", `let me = ctx.me; ${body}; return actions;`);
const B = "0xb", S = "0x5", now = Date.now() / 1000;
const pr = { shop: S, competitors: ["books.toscrape.com"] };
const base = { buyer: B, deadline: now + 9999, claims_left: 3, released: false, held: 6e15, buyer_recoverable: 0, shop_recoverable: 0 };
const run = (me, pu) => make(esc, gen, same, { me })({ ...base, ...pu }, pr);
const check = (name, ok) => { console.log(ok ? "ok  " : "FAIL", name); if (!ok) process.exitCode = 1; };

check("no wallet: prompt only", run(null, {}).includes("Connect the buyer"));
check("outsider, window open: not a party", run("0xz", {}).includes("not a party"));
check("buyer, window open: claim form naming the competitors", /data-form="claim"/.test(run(B, {})) && run(B, {}).includes("books.toscrape.com"));
check("shop never gets a claim form", !run(S, {}).includes('data-form="claim"'));
check("buyer, no claims left: no claim form", !run(B, { claims_left: 0 }).includes('data-form="claim"'));
check("buyer, window closed: no claim form", !run(B, { deadline: now - 1 }).includes('data-form="claim"'));
check("anyone can release after the window", run("0xz", { deadline: now - 1 }).includes('data-act="release"'));
check("no release while open or once released", !run("0xz", {}).includes("release") && !run("0xz", { deadline: now - 1, released: true }).includes('data-act="release"'));
check("buyer recovers only the buyer's failed payment", run(B, { buyer_recoverable: 5 }).includes('data-form="recover"') && !run(B, { shop_recoverable: 5 }).includes('data-form="recover"'));
check("shop recovers only the shop's failed payment", run(S, { shop_recoverable: 5 }).includes('data-form="recover"') && !run(S, { buyer_recoverable: 5 }).includes('data-form="recover"'));
