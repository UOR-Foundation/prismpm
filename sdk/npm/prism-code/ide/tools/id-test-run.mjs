#!/usr/bin/env node
// Loads id-test.html in headless Chrome (the one installed; nothing is downloaded),
// reads window.__idTest, reloads, restarts the browser on the same profile, and
// checks the signature again in Node from the local copy of the frame.
//   node tools/id-test-run.mjs [url] [profileDir]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webcrypto } from "node:crypto";

const url = process.argv[2] ?? "http://localhost:4173/id-test.html";
const profile = process.argv[3] ?? mkdtempSync(join(tmpdir(), "prism-id-test-"));
const browser = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!browser) throw new Error("no Chrome or Edge found");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open() {
  const portFile = join(profile, "DevToolsActivePort");
  rmSync(portFile, { force: true });
  const child = spawn(browser, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await sleep(100);
  const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
  let target;
  for (let i = 0; i < 50 && !target; i += 1) {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
    if (!target) await sleep(100);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => ((ws.onopen = done), (ws.onerror = fail)));
  let next = 0;
  const waiting = new Map();
  const requests = [];
  const logs = [];
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && waiting.has(m.id)) (m.error ? waiting.get(m.id).fail(new Error(m.error.message)) : waiting.get(m.id).done(m.result)), waiting.delete(m.id);
    if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url);
    if (m.method === "Network.webSocketCreated") requests.push(m.params.url);
    if (m.method === "Runtime.exceptionThrown") logs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") logs.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
  };
  const send = (method, params = {}) => new Promise((done, fail) => (waiting.set(++next, { done, fail }), ws.send(JSON.stringify({ id: next, method, params }))));
  for (const domain of ["Network", "Runtime", "Log", "Page"]) await send(`${domain}.enable`);
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const result = async () => {
    for (let i = 0; i < 300; i += 1) {
      if (await evaluate("Boolean(window.__idTest && window.__idTest.done)").catch(() => false)) break;
      await sleep(100);
    }
    return evaluate("JSON.parse(JSON.stringify(window.__idTest ?? null))");
  };
  const close = async () => {
    await send("Browser.close").catch(() => {});
    await new Promise((done) => (child.exitCode === null ? child.once("exit", done) : done()));
    await sleep(500);
  };
  return { send, evaluate, result, close, requests, logs };
}

const brief = (r) => r && { ok: r.ok, prismId: r.prismId, device: r.account?.key, expires: r.account?.expires, verified: r.verified, sealedRoundTrip: r.sealedRoundTrip, workspaceKeyStable: r.workspaceKeyStable, workspaceKeySha256: r.workspaceKeySha256, signature: r.signed?.signature, errors: r.errors };
const hosts = (list) => [...new Set(list.map((u) => { try { return new URL(u).origin; } catch { return u.slice(0, 40); } }))];

let page = await open();
await page.send("Page.navigate", { url });
const first = await page.result();
console.log("first load", JSON.stringify(brief(first), null, 1));
const firstCount = page.requests.length;
console.log("requests, first load:", page.requests.filter((u) => u !== "about:blank"));

await page.send("Page.reload", { ignoreCache: true });
await sleep(300);
const second = await page.result();
console.log("after reload", JSON.stringify(brief(second), null, 1));
console.log("origins contacted, both loads:", hosts(page.requests.filter((u) => u !== "about:blank")));
const bar = await page.evaluate(`(() => { const f = document.querySelector("prism-frame"); const b = f.shadowRoot.querySelector(".bar").getBoundingClientRect(); const a = f.shadowRoot.getElementById("account"); return { barHeight: b.height, barWidth: b.width, accountIconHidden: a.hidden, signedInClass: a.classList.contains("signed-in"), htmlClass: document.documentElement.className }; })()`);
console.log("frame drawn:", bar);
const logs1 = page.logs.slice();
await page.close();

page = await open();
await page.send("Page.navigate", { url });
const third = await page.result();
console.log("after browser restart", JSON.stringify(brief(third), null, 1));
console.log("origins contacted, after restart:", hosts(page.requests.filter((u) => u !== "about:blank")));
const logs2 = page.logs.slice();
await page.close();
console.log("page errors:", [...logs1, ...logs2]);

// A third party, in another process: only the message, the signature and the delegation.
globalThis.crypto ??= webcrypto;
const { verifySession } = await import(new URL("../public/prism-frame/frame/panels.mjs", import.meta.url));
const unb64u = (text) => Buffer.from(text, "base64url");
const nodeCheck = async (r, message) => {
  const who = await verifySession(r.signed.delegation, { fresh: 0 });
  const key = await crypto.subtle.importKey("raw", unb64u(who.sessionKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return { account: who.account, valid: await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, unb64u(r.signed.signature), new TextEncoder().encode(message)) };
};
const good = await nodeCheck(first, "prism-ide grant test");
const wrongMessage = await nodeCheck(first, "prism-ide grant test!");
const wrongApp = await verifySession({ ...first.signed.delegation, app: "http://localhost:4174" }, { fresh: 0 }).then(() => "accepted", (e) => `refused (${e.code})`);
console.log("node check:", { good, wrongMessage: wrongMessage.valid, delegationForAnotherOrigin: wrongApp });

const same = first?.prismId && first.prismId === second?.prismId && first.prismId === third?.prismId;
const sameKey = first?.workspaceKeySha256 && first.workspaceKeySha256 === second?.workspaceKeySha256 && first.workspaceKeySha256 === third?.workspaceKeySha256;
const pass = Boolean(first?.ok && second?.ok && third?.ok && same && sameKey && good.valid && good.account === first.prismId && !wrongMessage.valid && wrongApp.startsWith("refused"));
console.log(JSON.stringify({ pass, sameIdAcrossReloadAndRestart: Boolean(same), sameWorkspaceKey: Boolean(sameKey), profile }));
process.exit(pass ? 0 : 1);
