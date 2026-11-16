// Every app writes the same Lake workspace and the same foundation modules, under one module prefix, so LexLean's
// process store (SPEC 22.13) finds a module two apps share by its content identity, the module's name and text,
// and the process context, which covers the Lake files. Only the app's own modules differ between two apps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../src/journey/session.mjs';
import { appDir, readSession, writeApp } from '../src/journey/project.mjs';
import { readSpecFile } from '../src/journey/spec-file.mjs';
import { names } from '../src/journey/render.mjs';

const PARKING = {
  purpose: 'Parking fee tier: decide the parking fee tier for a vehicle from the hours parked and the vehicle type.',
  fields: 'hours: number 0..24, vehicle: car|motorcycle|truck',
  outcomes: 'free, standard, premium',
  rules: 'when hours = 0 then free\nwhen vehicle is motorcycle then free\nwhen vehicle is truck then premium\nwhen hours > 8 then premium\notherwise standard',
  properties: 'never when vehicle is motorcycle then premium',
  examples: '0 car -> free\n3 car -> standard\n10 car -> premium',
};
const written = (spec) => {
  const dir = appDir(mkdtempSync(join(tmpdir(), 'prism-shared-foundation-')));
  writeApp(dir, { ...readSession(dir), spec, axioms: {}, status: {} });
  return dir;
};
const files = (dir, sub) => {
  const out = [];
  const walk = (at, rel) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(at, e.name), `${rel}${e.name}/`);
      else out.push(`${rel}${e.name}`);
    }
  };
  if (existsSync(join(dir, sub))) walk(join(dir, sub), `${sub}/`);
  return out.sort();
};

test('two apps, one decision app and one that keeps state, share the Lake workspace and every foundation module, byte for byte', () => {
  const parking = compile({ ...PARKING, review: 'yes' }).spec;
  const seats = readSpecFile(readFileSync(new URL('./fixtures/stateful/dinner-seats.spec.json', import.meta.url), 'utf8')).spec;
  const a = written(parking);
  const b = written(seats);
  // Planted defect F1: the Lake files name a package per app, which puts every process of the two apps in a
  // different context, the runtime's included.
  for (const file of ['lakefile.toml', 'lake-manifest.json', 'lean-toolchain']) assert.equal(readFileSync(join(a, file), 'utf8'), readFileSync(join(b, file), 'utf8'), file);
  // Planted defect F2: a module prefix per app, which names the same foundation module differently in each.
  const prefix = (dir) => /^module_prefix = "([^"]+)"$/m.exec(readFileSync(join(dir, 'lexlean.toml'), 'utf8'))[1];
  assert.equal(prefix(a), prefix(b));
  assert.equal(names(parking).prefix, names(seats).prefix);
  const foundation = files(a, 'src/Foundation');
  assert.ok(foundation.length > 0);
  assert.deepEqual(files(b, 'src/Foundation'), foundation);
  for (const file of foundation) assert.equal(readFileSync(join(a, file), 'utf8'), readFileSync(join(b, file), 'utf8'), file);
  // The apps' own modules keep their own names, so two apps never claim one module name for different text.
  assert.notEqual(names(parking).module, names(seats).module);
  assert.ok(existsSync(join(a, 'src', `${names(parking).module}.lex.tex`)) && existsSync(join(b, 'src', `${names(seats).module}.lex.tex`)));
});
