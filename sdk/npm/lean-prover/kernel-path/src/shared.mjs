// One prover for the whole origin. Every tab, and every build running in them, is served by a single set of kernels.
//
// Why. A kernel holds the library in memory (about 64 to 77 MB each). Two tabs that each start their own kernels pay
// that twice, judge the library twice, and write the memo over each other. One owner does none of that.
//
// How. No server and no shared worker (not every browser has one): a Web Lock named by the environment's label
// decides which tab owns the prover, and a BroadcastChannel of the same name carries requests to it.
//   owner    holds the lock, opens the real prover (prover.mjs) at the first request, and answers every tab
//   client   opens nothing: no kernel, no library in memory, no memo. It asks the owner.
// When the owner's tab goes, the browser frees the lock, a waiting client becomes the owner, and it answers what
// it had asked itself. A client whose request is not acknowledged (the owner's tab is frozen in the background, as
// phones do) proves alone rather than wait. A host with no locks or no channel proves alone too.
//
// The environment's label names the lock, so tabs on different pins never share a prover: each label is its own.
//
//     const prover = await openShared({ env, open })     // open: () => openProver({...}), called only when needed
//     await prover.prove(text)                           // the same result, whoever judged it
const ACK_MS = 400, TRIES = 5;

export async function openShared({ env, open, locks = globalThis.navigator && globalThis.navigator.locks, Channel = globalThis.BroadcastChannel }) {
  let local = null; const mine = () => (local ??= open());
  if (!locks || !Channel) { return { environment: env, prove: async (text) => (await mine()).prove(text), role: () => "alone", kernels: async () => (await mine()).kernels(), close: async () => (await mine()).close() }; }

  const name = "lexlean-prover:" + env, ch = new Channel(name), me = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let role = "client", n = 0, release = null, closed = false;
  const asked = new Map(), serving = new Map(); // what this tab asked; what this tab, as owner, is answering
  const own = () => {
    if (closed) return;
    role = "owner"; // the prover itself is opened by the first request, not before
    for (const [id, a] of asked) { asked.delete(id); mine().then((p) => p.prove(a.text)).then(a.ok, a.bad); }
    return new Promise((done) => { release = done; }); // the lock is held for as long as this tab lives
  };
  ch.onmessage = ({ data }) => {
    if (data.ask && role === "owner") {
      ch.postMessage({ got: data.ask });
      if (serving.has(data.ask)) return; // a repeat of a request already being answered
      serving.set(data.ask, mine().then((p) => p.prove(data.text)).then((result) => ch.postMessage({ answer: data.ask, result }), (e) => ch.postMessage({ answer: data.ask, error: String(e && e.message || e) })).finally(() => serving.delete(data.ask)));
    } else if (data.got) { const a = asked.get(data.got); if (a) a.acked = true; }
    else if (data.answer) { const a = asked.get(data.answer); if (a) { asked.delete(data.answer); if (data.error) a.bad(new Error(data.error)); else a.ok({ ...data.result, shared: true }); } }
  };
  const first = await new Promise((res) => { locks.request(name, { ifAvailable: true }, (lock) => { res(!!lock); return lock ? own() : undefined; }); });
  if (!first) locks.request(name, () => own()); // waits behind the owner, and takes over when its tab goes

  const prove = (text) => {
    if (role === "owner") return mine().then((p) => p.prove(text));
    return new Promise((ok, bad) => {
      const id = me + ":" + n++, a = { text, ok, bad, acked: false }; asked.set(id, a); let tries = 0;
      const send = () => {
        if (!asked.has(id) || a.acked) return; // answered, taken over by this tab, or the owner has it
        if (tries++ >= TRIES) { asked.delete(id); mine().then((p) => p.prove(text)).then(ok, bad); return; } // no owner is listening
        ch.postMessage({ ask: id, text }); const t = setTimeout(send, ACK_MS); if (t.unref) t.unref();
      };
      send();
    });
  };
  return {
    environment: env, prove, role: () => role,
    kernels: async () => (local ? (await local).kernels() : 0),
    close: async () => { closed = true; ch.close(); if (release) release(); if (local) await (await local).close(); },
  };
}
