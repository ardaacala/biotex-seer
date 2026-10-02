export const LS_SES = 'barcode-scanner.ses';
export const LS_VIB = 'barcode-scanner.vibration';

export function readPref(key: string, defaultVal: boolean): boolean {
  if (typeof window === 'undefined') return defaultVal;
  try {
    const v = window.localStorage.getItem(key);
    if (v === '0' || v === 'false') return false;
    if (v === '1' || v === 'true') return true;
  } catch { /* noop */ }
  return defaultVal;
}

export function writePref(key: string, val: boolean) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, val ? '1' : '0'); } catch { /* noop */ }
}

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_audioCtx) {
      const Ctor = (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return null;
      _audioCtx = new Ctor();
    }
    if (_audioCtx.state === 'suspended') {
      void _audioCtx.resume();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

export function playTone(freq: number, durationMs: number, type: OscillatorType = 'sine', volume = 0.18) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  } catch { /* noop */ }
}

export function playSuccessBeep() {
  playTone(1320, 90, 'sine', 0.2);
}

export function playFailureBeep() {
  playTone(330, 120, 'square', 0.18);
  setTimeout(() => playTone(220, 160, 'square', 0.18), 130);
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== 'function') return;
  try { nav.vibrate(pattern); } catch { /* noop */ }
}

export interface FeedbackOptions {
  ses: boolean;
  vibration: boolean;
}

export const SUCCESS_VIBRATION_PATTERN: number | number[] = 60;
export const FAILURE_VIBRATION_PATTERN: number | number[] = [80, 60, 80, 60, 120];

export function runFeedback(ok: boolean, opts: FeedbackOptions) {
  if (opts.ses) {
    if (ok) playSuccessBeep();
    else playFailureBeep();
  }
  if (opts.vibration) {
    vibrate(ok ? SUCCESS_VIBRATION_PATTERN : FAILURE_VIBRATION_PATTERN);
  }
}

/**
 * Maps an onScan callback's return value to a success/failure branch and
 * invokes the provided feedback function exactly once.
 *
 * Contract (matches BarcodeScanner.emit):
 *   - onScan returns / resolves to `false` → feedback(false)
 *   - onScan returns / resolves to `true`  → feedback(true)
 *   - onScan returns / resolves to `undefined`/void → feedback(true) (legacy)
 *   - onScan throws / rejects → feedback(false)
 */
export type ScanCallbackResult = boolean | void;
export type ScanCallback<Source = string> = (
  code: string,
  source: Source,
) => ScanCallbackResult | Promise<ScanCallbackResult>;

export async function dispatchScan<Source>(
  onScan: ScanCallback<Source>,
  feedback: (ok: boolean) => void,
  code: string,
  source: Source,
): Promise<void> {
  try {
    const result = await Promise.resolve(onScan(code, source));
    if (result === false) feedback(false);
    else feedback(true);
  } catch {
    feedback(false);
  }
}
