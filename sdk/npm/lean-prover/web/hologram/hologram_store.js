/* @ts-self-types="./hologram_store.d.ts" */

/**
 * Worker-side dispatcher. Constructed from the SAB the main thread postMessage'd; `serve_step`
 * blocks until a request arrives, handles it, and writes the response. The Worker's JS glue
 * runs this in a loop (or one-shot per request, per design).
 */
export class BridgeWorker {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BridgeWorkerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_bridgeworker_free(ptr, 0);
    }
    /**
     * Diagnostic: SAB size in bytes.
     * @returns {number}
     */
    capacity() {
        const ret = wasm.bridgeworker_capacity(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The `Int32Array` view used by `Atomics.waitAsync` in the JS Worker loop. Exposed so the
     * JS glue can `Atomics.waitAsync(bridge.i32_view, 0, STATE_IDLE)` without re-constructing
     * the view (and so the offset/state constants stay consistent across Rust + JS).
     * @returns {Int32Array}
     */
    i32_view() {
        const ret = wasm.bridgeworker_i32_view(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {SharedArrayBuffer} sab
     */
    constructor(sab) {
        const ret = wasm.bridgeworker_new(sab);
        this.__wbg_ptr = ret;
        BridgeWorkerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Sentinel returned by [`serve_step`] when no request is pending (the JS loop should
     * `Atomics.waitAsync(i32_view, 0, STATE_IDLE)` until the main thread notifies). `u32::MAX`.
     * @returns {number}
     */
    static no_work() {
        const ret = wasm.bridgeworker_no_work();
        return ret >>> 0;
    }
    /**
     * Try to dispatch one pending request. If the SAB state is not `REQUEST`, returns
     * `Ok(NO_WORK)` immediately — the JS Worker loop is expected to suspend on
     * `Atomics.waitAsync(i32_view, STATE_OFFSET, STATE_IDLE)` between calls (the standard
     * non-blocking wait primitive on Workers; see `web/bridge-worker.mjs`). Returns the
     * opcode that was handled on a normal dispatch.
     * @returns {Promise<number>}
     */
    serve_step() {
        const ret = wasm.bridgeworker_serve_step(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) BridgeWorker.prototype[Symbol.dispose] = BridgeWorker.prototype.free;

/**
 * Main-thread sync façade for the OPFS bridge. Wraps a SharedArrayBuffer that a Worker reads
 * + writes through the [`Op`] protocol.
 */
export class SyncOpfsBridge {
    static __wrap(ptr) {
        const obj = Object.create(SyncOpfsBridge.prototype);
        obj.__wbg_ptr = ptr;
        SyncOpfsBridgeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SyncOpfsBridgeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_syncopfsbridge_free(ptr, 0);
    }
    /**
     * Main-thread `contains(kappa)` — synchronous; `true` iff OPFS holds bytes at that κ.
     * @param {string} kappa
     * @returns {boolean}
     */
    contains(kappa) {
        const ptr0 = passStringToWasm0(kappa, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.syncopfsbridge_contains(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * Main-thread `delete(kappa)` — synchronous; `true` iff the file was removed (false ⇒ absent).
     * @param {string} kappa
     * @returns {boolean}
     */
    delete(kappa) {
        const ptr0 = passStringToWasm0(kappa, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.syncopfsbridge_delete(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * Main-thread `get(kappa)` — synchronous. Returns the bytes, or `null` if absent. Verifies
     * on receipt (SPINE-4) — the responder may not lie about content.
     * @param {string} kappa
     * @returns {any}
     */
    get(kappa) {
        const ptr0 = passStringToWasm0(kappa, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.syncopfsbridge_get(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Main-thread `iterate()` — synchronous; returns a `js_sys::Array` of κ-label strings.
     * @returns {Array<any>}
     */
    iterate() {
        const ret = wasm.syncopfsbridge_iterate(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * New bridge backed by a SharedArrayBuffer of `SAB_CAPACITY` bytes.
     */
    constructor() {
        const ret = wasm.syncopfsbridge_new();
        this.__wbg_ptr = ret;
        SyncOpfsBridgeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * New bridge with explicit capacity.
     * @param {number} capacity
     * @returns {SyncOpfsBridge}
     */
    static new_with_capacity(capacity) {
        const ret = wasm.syncopfsbridge_new_with_capacity(capacity);
        return SyncOpfsBridge.__wrap(ret);
    }
    /**
     * Main-thread `put(axis, bytes)` — synchronous. Blocks via `Atomics.wait` until the paired
     * Worker has stored the bytes and written the κ-label back to the SAB. Returns the κ as a
     * 71-byte string.
     * @param {string} axis
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    put(axis, bytes) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(axis, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.syncopfsbridge_put(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Hand the SAB to the Worker (postMessage) — the Worker constructs its own
     * [`BridgeWorker`] over this buffer.
     * @returns {SharedArrayBuffer}
     */
    sab() {
        const ret = wasm.syncopfsbridge_sab(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) SyncOpfsBridge.prototype[Symbol.dispose] = SyncOpfsBridge.prototype.free;

/**
 * Mint the κ-label for `bytes` on the BLAKE3 σ-axis (the same address as every other substrate).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function address(bytes) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.address(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {number}
 */
export function bridge_state_idle() {
    const ret = wasm.bridge_state_idle();
    return ret;
}

/**
 * Constants exposed to the JS glue so the Worker can correctly call `Atomics.waitAsync`.
 * @returns {number}
 */
export function bridge_state_offset() {
    const ret = wasm.bridge_state_offset();
    return ret >>> 0;
}

/**
 * Remove the file backing `kappa` from OPFS. Returns `true` if a file was removed, `false` if it
 * wasn't present.
 * @param {string} kappa
 * @returns {Promise<boolean>}
 */
export function opfs_delete(kappa) {
    const ptr0 = passStringToWasm0(kappa, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.opfs_delete(ptr0, len0);
    return ret;
}

/**
 * Reachability walk + sweep (arch §11.5). `pins` is the durable root set; the walk follows each
 * pin's `references()` via the realization registry recursively (SPINE-3) and deletes every OPFS
 * file whose κ is not in the resulting reachable set. Returns the count of files deleted.
 * @param {any} pins
 * @returns {Promise<number>}
 */
export function opfs_gc(pins) {
    const ret = wasm.opfs_gc(pins);
    return ret;
}

/**
 * Read the bytes stored under `kappa` from OPFS; `null` if absent (eviction-tolerant). The bytes
 * are **verified** against `kappa` before returning (SPINE-4) — a tampered OPFS file is rejected.
 * @param {string} kappa
 * @returns {Promise<any>}
 */
export function opfs_get(kappa) {
    const ptr0 = passStringToWasm0(kappa, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.opfs_get(ptr0, len0);
    return ret;
}

/**
 * List every κ-label currently held in OPFS. The browser's `FileSystemDirectoryHandle` exposes an
 * async iterator over `[name, handle]` entries; we walk it via the JS `keys()` async iterator.
 * @returns {Promise<any>}
 */
export function opfs_iterate() {
    const ret = wasm.opfs_iterate();
    return ret;
}

/**
 * Persist `bytes` under their κ-label in OPFS; returns the κ-label. Idempotent at the content level
 * (same bytes ⇒ same κ ⇒ same file).
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export function opfs_put(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.opfs_put(ptr0, len0);
    return ret;
}

/**
 * Verify `bytes` re-derive to `kappa` through the σ-axis (SPINE-4).
 * @param {Uint8Array} bytes
 * @param {string} kappa
 * @returns {boolean}
 */
export function verify(bytes, kappa) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(kappa, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.verify(ptr0, len0, ptr1, len1);
    return ret !== 0;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_debug_string_0accd80f45e5faa2: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_falsy_d7ed49840e6d9abb: function(arg0) {
            const ret = !arg0;
            return ret;
        },
        __wbg___wbindgen_is_function_754e9f305ff6029e: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_87c3bfe968c6a5ad: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_undefined_67b456be8673d3d7: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_string_get_72bdf95d3ae505b1: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_61db23ac97f16c31: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_arrayBuffer_a0e88fd0c0e099b2: function(arg0) {
            const ret = arg0.arrayBuffer();
            return ret;
        },
        __wbg_byteLength_5d4e1aecdd1fdfd4: function(arg0) {
            const ret = arg0.byteLength;
            return ret;
        },
        __wbg_call_8a89609d89f6608a: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_9c758de292015997: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_close_3a6bb6c95fcc0a4a: function(arg0) {
            const ret = arg0.close();
            return ret;
        },
        __wbg_createWritable_d19f7c689e379eac: function(arg0) {
            const ret = arg0.createWritable();
            return ret;
        },
        __wbg_getDirectory_81f0c16f73a7f542: function(arg0) {
            const ret = arg0.getDirectory();
            return ret;
        },
        __wbg_getFileHandle_1bfaf7268935b051: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.getFileHandle(getStringFromWasm0(arg1, arg2), arg3);
            return ret;
        },
        __wbg_getFileHandle_9eb65ed1a1a19482: function(arg0, arg1, arg2) {
            const ret = arg0.getFileHandle(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_getFile_57f23539bd8b1536: function(arg0) {
            const ret = arg0.getFile();
            return ret;
        },
        __wbg_get_2b48c7d0d006a781: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_de6a0f7d4d18a304: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_index_ab123d64c89e3156: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_33f6e5c9e2f2d6b2: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_instanceof_FileSystemDirectoryHandle_527d4a4ebcd0f631: function(arg0) {
            let result;
            try {
                result = arg0 instanceof FileSystemDirectoryHandle;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_FileSystemFileHandle_6290c6738a00655e: function(arg0) {
            let result;
            try {
                result = arg0 instanceof FileSystemFileHandle;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_FileSystemWritableFileStream_7304a3b508b27eb6: function(arg0) {
            let result;
            try {
                result = arg0 instanceof FileSystemWritableFileStream;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_File_4389d03fd2e0b69e: function(arg0) {
            let result;
            try {
                result = arg0 instanceof File;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_e093be59ee9a8e14: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_67c2c9c4313f4448: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_length_4a591ecaa01354d9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_66f1a4b2e9026940: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_load_e98984f462e97454: function() { return handleError(function (arg0, arg1) {
            const ret = Atomics.load(arg0, arg1 >>> 0);
            return ret;
        }, arguments); },
        __wbg_navigator_3833ecdbc19d2757: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_new_578aeef4b6b94378: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_ce1ab61c1c2b300d: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_d4c752f1281b2f74: function(arg0) {
            const ret = new SharedArrayBuffer(arg0 >>> 0);
            return ret;
        },
        __wbg_new_d90091b82fdf5b91: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_dc32d91df76232c8: function(arg0) {
            const ret = new Int32Array(arg0);
            return ret;
        },
        __wbg_new_from_slice_18fa1f71286d66b8: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_bf31d18f92484486: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_e499a4d473dbf604___convert__closures_____invoke___js_sys_fa9a4c12a9e4271e___Function_fn_wasm_bindgen_e499a4d473dbf604___JsValue_____wasm_bindgen_e499a4d473dbf604___sys__Undefined___js_sys_fa9a4c12a9e4271e___Function_fn_wasm_bindgen_e499a4d473dbf604___JsValue_____wasm_bindgen_e499a4d473dbf604___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_notify_114de5bbdc397c0a: function() { return handleError(function (arg0, arg1) {
            const ret = Atomics.notify(arg0, arg1 >>> 0);
            return ret;
        }, arguments); },
        __wbg_prototypesetcall_3249fc62a0fafa30: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_a6822215aa43e71c: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_queueMicrotask_35c611f4a14830b2: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_queueMicrotask_404ed0a58e0b63cc: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_removeEntry_e4b1351d33d6ed6e: function(arg0, arg1, arg2) {
            const ret = arg0.removeEntry(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_resolve_25a7e548d5881dca: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_set_c775d84916be79ea: function(arg0, arg1, arg2) {
            arg0.set(arg1, arg2 >>> 0);
        },
        __wbg_set_create_7f95adb9ce7dde2a: function(arg0, arg1) {
            arg0.create = arg1 !== 0;
        },
        __wbg_set_index_73ced2e1b4a2a37e: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_static_accessor_GLOBAL_9d53f2689e622ca1: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_4c59f6c7ea29a144: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_e70ae9f2eb052253: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_storage_3f560ba25b19525f: function(arg0) {
            const ret = arg0.storage;
            return ret;
        },
        __wbg_store_6ac3b7b3c8f6a103: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Atomics.store(arg0, arg1 >>> 0, arg2);
            return ret;
        }, arguments); },
        __wbg_then_18f476d590e58992: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_ac7b025999b52837: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_wait_20d039872aa0f0c8: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Atomics.wait(arg0, arg1 >>> 0, arg2);
            return ret;
        }, arguments); },
        __wbg_write_04de655f6cd6c4bd: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.write(getArrayU8FromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 7, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_e499a4d473dbf604___convert__closures_____invoke___wasm_bindgen_e499a4d473dbf604___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_e499a4d473dbf604___JsError___true_);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./hologram_store_bg.js": import0,
    };
}

function wasm_bindgen_e499a4d473dbf604___convert__closures_____invoke___wasm_bindgen_e499a4d473dbf604___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_e499a4d473dbf604___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_e499a4d473dbf604___convert__closures_____invoke___wasm_bindgen_e499a4d473dbf604___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_e499a4d473dbf604___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_e499a4d473dbf604___convert__closures_____invoke___js_sys_fa9a4c12a9e4271e___Function_fn_wasm_bindgen_e499a4d473dbf604___JsValue_____wasm_bindgen_e499a4d473dbf604___sys__Undefined___js_sys_fa9a4c12a9e4271e___Function_fn_wasm_bindgen_e499a4d473dbf604___JsValue_____wasm_bindgen_e499a4d473dbf604___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_e499a4d473dbf604___convert__closures_____invoke___js_sys_fa9a4c12a9e4271e___Function_fn_wasm_bindgen_e499a4d473dbf604___JsValue_____wasm_bindgen_e499a4d473dbf604___sys__Undefined___js_sys_fa9a4c12a9e4271e___Function_fn_wasm_bindgen_e499a4d473dbf604___JsValue_____wasm_bindgen_e499a4d473dbf604___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
}

const BridgeWorkerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_bridgeworker_free(ptr, 1));
const SyncOpfsBridgeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_syncopfsbridge_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('hologram_store_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
