/** A plan a guest answers: WGSL from LexLean's Kernel module, its BLAKE3 address, and one u32 buffer per binding. */
export interface WebGpuPlan {
  wgsl: string;
  /** BLAKE3 of the WGSL text as UTF-8, lowercase hex. */
  kernel: string;
  invocations: number;
  buffers: ArrayLike<number>[];
}
export type Verdict = 'agree' | 'differ' | 'not-run';
export const VERDICT: readonly Verdict[];
export function kernelAddress(wgsl: string): string;
export function kernelShape(wgsl: string): { bindings: { binding: number; access: 'read' | 'read_write' }[] | null; declared: number; workgroupSize: number };
export function planFacts(plan: WebGpuPlan, options?: { adapter?: boolean; limits?: { maxStorageBufferBindingSize?: number; maxComputeWorkgroupsPerDimension?: number } }): Record<string, number | string>;
export function planAdmitted(facts: Record<string, number | string>): boolean;
export function readbackFacts(words: number, bytes: ArrayBuffer): { expectedWords: number; readWords: number; trailingBytes: number };
export function readbackAdmitted(facts: { expectedWords: number; readWords: number; trailingBytes: number }): boolean;
/** Compare the CPU's words with the GPU's. */
export function compare(facts: { ran: boolean; planOk?: boolean; readbackOk?: boolean; cpu?: ArrayLike<number>; gpu?: ArrayLike<number> }): { verdict: Verdict; facts: Record<string, number> };
/** Run an admitted plan on WebGPU (navigator.gpu by default) and read back every read_write buffer, keyed by binding. */
export function runPlan(plan: WebGpuPlan, options?: { gpu?: unknown }): Promise<{ outputs: Map<number, Uint32Array>; adapter: { vendor: string; architecture: string }; facts: Record<string, number | string> }>;
