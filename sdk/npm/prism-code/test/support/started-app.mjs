// A new app folder started from a starter, and a stand-in for LexLean's semantic snapshot. The journey's `snapshot`
// option takes the place of LexLean as WebAssembly in these tests: it answers in this process and records each call.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appDir, readSession, startApp } from '../../src/journey/project.mjs';

/** A new app folder started from `starter`, and its session. */
export function startedApp(starter = 'rule-app') {
  const dir = appDir(mkdtempSync(join(tmpdir(), `prism-${starter}-`)));
  startApp(dir, starter);
  return { dir, session: { ...readSession(dir), starter } };
}

/** `snapshot`, a function of the app's folder that returns `taken`, and `asked`, every folder it was called with. */
export function snapshotOf(taken) {
  const asked = [];
  return { asked, snapshot: (dir) => (asked.push(dir), taken) };
}
