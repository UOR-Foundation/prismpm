// Measures the canonical build's budgets that exist today, under Node, with Lean's kernel as WebAssembly.
// Run from the repository root: node docs/proposals/canonical-serverless-build/measure.mjs
// It needs the kernel files once (about 2.3 MB from raw.githubusercontent.com, checked by SHA-256).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../../../sdk/npm/prism-code/src/journey/session.mjs';
import { KERNEL_FILES, ensureKernel } from '../../../sdk/npm/prism-code/src/journey/kernel-store.mjs';
import { kernelProve, openKernel } from '../../../sdk/npm/prism-code/src/journey/kernel-prove.mjs';
import { processLedger } from '../../../sdk/npm/prism-code/src/journey/hosts.mjs';

const BRIEFS = {
  leapYear: {
    purpose: 'Leap year: decide whether a year is a leap year in a simplified calendar where every year from 2000 that is a multiple of four is one.',
    fields: 'year: number 0..9999, multipleOfFour: yes|no',
    outcomes: 'leap, common',
    rules: 'when multipleOfFour is yes and year >= 2000 then leap\notherwise common',
    properties: 'never when multipleOfFour is no then leap\nnever when year < 2000 then leap',
    examples: '2024 yes -> leap',
  },
  parking: {
    purpose: 'Parking fee tier: decide the parking fee tier for a vehicle from the hours parked and the vehicle type.',
    fields: 'hours: number 0..24, vehicle: car|motorcycle|truck',
    outcomes: 'free, standard, premium',
    rules: 'when hours = 0 then free\nwhen vehicle is motorcycle then free\nwhen vehicle is truck then premium\nwhen hours > 8 then premium\notherwise standard',
    properties: 'never when vehicle is motorcycle then premium\nalways when vehicle is truck and hours > 0 then premium\nnever when hours = 0 then standard',
    examples: '0 car -> free',
  },
};

const ms = (t) => Math.round((performance.now() - t) * 10) / 10;
const home = { PRISM_HOME: mkdtempSync(join(tmpdir(), 'prism-measure-')) };
const env = { ...process.env, ...home, PRISM_KERNEL_DIR: join(home.PRISM_HOME, 'kernel') };

let t = performance.now();
const fetched = await ensureKernel({ env });
const out = { node: process.version, platform: `${process.platform} ${process.arch}`, kernelFirstRun: { ms: ms(t), files: fetched.length, bytes: Object.values(KERNEL_FILES).reduce((n, f) => n + f.bytes, 0), hosts: processLedger.report() } };
t = performance.now();
const kernel = await openKernel();
out.kernelOpenMs = ms(t);
out.briefs = {};
for (const [name, answers] of Object.entries(BRIEFS)) {
  const spec = compile({ ...answers, review: 'yes' }).spec;
  t = performance.now();
  const first = await kernelProve(spec, { env, kernel });
  const produced = ms(t);
  t = performance.now();
  const again = await kernelProve(spec, { env, kernel });
  const reused = ms(t);
  out.briefs[name] = {
    guarantees: first.judged.length,
    status: first.judged.map((j) => j.status),
    producedAndJudgedMs: produced,
    reusedAndJudgedAgainMs: reused,
    reusedShare: `${again.reused}/${again.judged.length}`,
    statusAgain: again.judged.map((j) => j.status),
  };
}
console.log(JSON.stringify(out, null, 2));
