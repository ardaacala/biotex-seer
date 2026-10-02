import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

interface OscillatorMock {
  type: OscillatorType;
  frequency: { value: number };
  connect: (n: unknown) => unknown;
  start: () => void;
  stop: (_t?: number) => void;
}
interface GainMock {
  gain: {
    setValueAtTime: (v: number, t: number) => void;
    exponentialRampToValueAtTime: (v: number, t: number) => void;
  };
  connect: (n: unknown) => unknown;
}
interface AudioCtxMock {
  state: string;
  currentTime: number;
  resume: () => void;
  destination: object;
  createOscillator: () => OscillatorMock;
  createGain: () => GainMock;
}

let oscillatorsCreated: OscillatorMock[] = [];
let gainsCreated: GainMock[] = [];
let audioCtorCalls = 0;
let vibrateCalls: Array<number | number[]> = [];
let storage: Record<string, string> = {};

function makeAudioCtx(): AudioCtxMock {
  audioCtorCalls++;
  return {
    state: 'running',
    currentTime: 0,
    resume: () => {},
    destination: {},
    createOscillator: () => {
      const osc: OscillatorMock = {
        type: 'sine',
        frequency: { value: 0 },
        connect: (n) => n,
        start: () => {},
        stop: () => {},
      };
      oscillatorsCreated.push(osc);
      return osc;
    },
    createGain: () => {
      const g: GainMock = {
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: (n) => n,
      };
      gainsCreated.push(g);
      return g;
    },
  };
}

function installEnv() {
  const localStorageMock = {
    getItem: (k: string) => (k in storage ? storage[k] : null),
    setItem: (k: string, v: string) => { storage[k] = String(v); },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { storage = {}; },
    key: (i: number) => Object.keys(storage)[i] ?? null,
    get length() { return Object.keys(storage).length; },
  };
  const win = {
    AudioContext: function (this: unknown) { return makeAudioCtx(); } as unknown as typeof AudioContext,
    localStorage: localStorageMock,
  };
  const nav = {
    vibrate: (p: number | number[]) => { vibrateCalls.push(p); return true; },
  };
  (globalThis as unknown as { window: typeof win }).window = win;
  (globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage = localStorageMock;
  (globalThis as unknown as { navigator: typeof nav }).navigator = nav;
}

function clearEnv() {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).navigator;
}

beforeEach(() => {
  oscillatorsCreated = [];
  gainsCreated = [];
  audioCtorCalls = 0;
  vibrateCalls = [];
  storage = {};
  installEnv();
});

afterEach(() => {
  clearEnv();
});

async function loadModule() {
  // Cache-bust import so the module-level `_audioCtx` cache doesn't leak between tests
  return await import(`./scanner-feedback.ts?cb=${Math.random()}`);
}

test('runFeedback(true) plays success beep and short vibration when both enabled', async () => {
  const mod = await loadModule();
  mod.runFeedback(true, { ses: true, vibration: true });
  assert.equal(oscillatorsCreated.length, 1, 'one oscillator for success beep');
  assert.equal(oscillatorsCreated[0].frequency.value, 1320, 'success beep frequency');
  assert.deepEqual(vibrateCalls, [60], 'short success vibration');
});

test('runFeedback(false) plays failure beep tones and failure vibration pattern', async () => {
  const mod = await loadModule();
  mod.runFeedback(false, { ses: true, vibration: true });
  // First failure tone is scheduled synchronously; the second one is deferred via setTimeout.
  // We assert at least the first one was created and the failure vibration pattern was used.
  assert.ok(oscillatorsCreated.length >= 1, 'at least one failure oscillator');
  assert.equal(oscillatorsCreated[0].frequency.value, 330, 'first failure tone frequency');
  assert.equal(oscillatorsCreated[0].type, 'square', 'first failure tone is square');
  assert.deepEqual(vibrateCalls, [[80, 60, 80, 60, 120]], 'failure vibration pattern');
});

test('runFeedback does not call audio APIs when ses is disabled', async () => {
  const mod = await loadModule();
  mod.runFeedback(true, { ses: false, vibration: true });
  mod.runFeedback(false, { ses: false, vibration: true });
  assert.equal(audioCtorCalls, 0, 'AudioContext is never constructed');
  assert.equal(oscillatorsCreated.length, 0, 'no oscillators created');
  assert.equal(gainsCreated.length, 0, 'no gain nodes created');
  // Vibration still happens for both calls (success then failure)
  assert.equal(vibrateCalls.length, 2, 'vibration still triggered when only ses is off');
});

test('runFeedback does not call navigator.vibrate when vibration is disabled', async () => {
  const mod = await loadModule();
  mod.runFeedback(true, { ses: true, vibration: false });
  mod.runFeedback(false, { ses: true, vibration: false });
  assert.equal(vibrateCalls.length, 0, 'no vibration calls');
  assert.ok(oscillatorsCreated.length >= 1, 'audio still triggered when only vibration is off');
});

test('runFeedback is a complete no-op when both feedback channels are off', async () => {
  const mod = await loadModule();
  mod.runFeedback(true, { ses: false, vibration: false });
  mod.runFeedback(false, { ses: false, vibration: false });
  assert.equal(audioCtorCalls, 0);
  assert.equal(oscillatorsCreated.length, 0);
  assert.equal(vibrateCalls.length, 0);
});

test('readPref/writePref round-trip via localStorage', async () => {
  const mod = await loadModule();
  // Defaults when nothing is stored
  assert.equal(mod.readPref(mod.LS_SES, true), true);
  assert.equal(mod.readPref(mod.LS_VIB, true), true);
  // Persist false
  mod.writePref(mod.LS_SES, false);
  mod.writePref(mod.LS_VIB, false);
  assert.equal(storage[mod.LS_SES], '0');
  assert.equal(storage[mod.LS_VIB], '0');
  assert.equal(mod.readPref(mod.LS_SES, true), false, 'reads stored false');
  assert.equal(mod.readPref(mod.LS_VIB, true), false, 'reads stored false');
  // Persist true again
  mod.writePref(mod.LS_SES, true);
  assert.equal(storage[mod.LS_SES], '1');
  assert.equal(mod.readPref(mod.LS_SES, false), true);
});

test('readPref accepts legacy "true"/"false" string values', async () => {
  const mod = await loadModule();
  storage[mod.LS_SES] = 'false';
  storage[mod.LS_VIB] = 'true';
  assert.equal(mod.readPref(mod.LS_SES, true), false);
  assert.equal(mod.readPref(mod.LS_VIB, false), true);
});

/* ─── dispatchScan: maps onScan return value to success/failure feedback ──── */

test('dispatchScan: onScan returning true triggers success feedback', async () => {
  const mod = await loadModule();
  const calls: boolean[] = [];
  const onScan = async () => true;
  await mod.dispatchScan(onScan, (ok: boolean) => calls.push(ok), 'CODE-1', 'manuel');
  assert.deepEqual(calls, [true]);
});

test('dispatchScan: onScan returning false triggers failure feedback', async () => {
  const mod = await loadModule();
  const calls: boolean[] = [];
  const onScan = async () => false;
  await mod.dispatchScan(onScan, (ok: boolean) => calls.push(ok), 'CODE-2', 'manuel');
  assert.deepEqual(calls, [false]);
});

test('dispatchScan: onScan returning void/undefined triggers success feedback (legacy)', async () => {
  const mod = await loadModule();
  const calls: boolean[] = [];
  const onScan = () => { /* returns undefined */ };
  await mod.dispatchScan(onScan, (ok: boolean) => calls.push(ok), 'CODE-3', 'manuel');
  assert.deepEqual(calls, [true]);
});

test('dispatchScan: synchronous true/false are both honored', async () => {
  const mod = await loadModule();
  const calls: boolean[] = [];
  await mod.dispatchScan(() => true, (ok: boolean) => calls.push(ok), 'A', 'manuel');
  await mod.dispatchScan(() => false, (ok: boolean) => calls.push(ok), 'B', 'manuel');
  assert.deepEqual(calls, [true, false]);
});

test('dispatchScan: a thrown / rejected onScan triggers failure feedback', async () => {
  const mod = await loadModule();
  const calls: boolean[] = [];
  const onScanThrows = () => { throw new Error('boom'); };
  const onScanRejects = async () => { throw new Error('boom-async'); };
  await mod.dispatchScan(onScanThrows, (ok: boolean) => calls.push(ok), 'X', 'manuel');
  await mod.dispatchScan(onScanRejects, (ok: boolean) => calls.push(ok), 'Y', 'manuel');
  assert.deepEqual(calls, [false, false]);
});

test('dispatchScan: onScan is invoked with the code and source unchanged', async () => {
  const mod = await loadModule();
  const seen: Array<[string, string]> = [];
  const onScan = (code: string, source: string) => { seen.push([code, source]); return true; };
  await mod.dispatchScan(onScan, () => {}, 'BTX-DH-42', 'kamera');
  assert.deepEqual(seen, [['BTX-DH-42', 'kamera']]);
});

/* ─── End-to-end persistence cycle: simulates a "page reload" by re-importing
       the module while keeping the same localStorage. Verifies the preference
       written before the reload is what's read back after. ─────────────────── */

test('persistence cycle: writePref → simulated page reload → readPref returns the persisted value', async () => {
  const before = await loadModule();
  // User opens the scanner and turns both feedback channels OFF.
  before.writePref(before.LS_SES, false);
  before.writePref(before.LS_VIB, false);
  assert.equal(storage[before.LS_SES], '0');
  assert.equal(storage[before.LS_VIB], '0');

  // Simulate a full page reload: tear down the audio singleton + re-import the
  // module fresh. The localStorage backing store is intentionally preserved.
  const after = await loadModule();

  // The freshly mounted scanner reads its initial switch state from storage.
  assert.equal(after.readPref(after.LS_SES, true), false, 'sound preference survives reload');
  assert.equal(after.readPref(after.LS_VIB, true), false, 'vibration preference survives reload');

  // And on top of being remembered, the runFeedback call after reload still
  // honors the persisted "off" preferences (no audio, no vibration).
  after.runFeedback(true, { ses: after.readPref(after.LS_SES, true), vibration: after.readPref(after.LS_VIB, true) });
  assert.equal(audioCtorCalls, 0, 'no audio after reload because preference was off');
  assert.equal(vibrateCalls.length, 0, 'no vibration after reload because preference was off');

  // User flips one preference back on; the value is persisted again.
  after.writePref(after.LS_SES, true);
  const afterAgain = await loadModule();
  assert.equal(afterAgain.readPref(afterAgain.LS_SES, false), true, 'flip-back also survives reload');
  assert.equal(afterAgain.readPref(afterAgain.LS_VIB, true), false, 'unrelated pref unchanged');
});

test('readPref falls back to default when value is missing or unrecognized', async () => {
  const mod = await loadModule();
  assert.equal(mod.readPref('missing-key', true), true);
  assert.equal(mod.readPref('missing-key', false), false);
  storage['weird'] = 'maybe';
  assert.equal(mod.readPref('weird', true), true);
  assert.equal(mod.readPref('weird', false), false);
});
