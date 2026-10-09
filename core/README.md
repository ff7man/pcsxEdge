# Rebuilding the PCSX-ReARMed core

`pcsx-rearmed/` contains the PCSX-ReARMed source used by pcsxEdge at commit
`c8816799b50388e61cfe237fe2cdbb7d8175f20a`. Its `frontend/libpicofe/`
directory is vendored at submodule commit
`a2697389e76744cfa0c56c13a172845c45ede719` so a fresh checkout does not need
to fetch a submodule.

The pcsxEdge-specific browser integration is in `../browser_shim.c`; it
connects libretro video, audio, and input callbacks and exposes memory-card
and save-state functions to JavaScript. The upstream emulator sources were
not modified for the browser wrapper.

Install and activate the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html),
then run from the repository root:

```sh
./build_core_archive.sh
./build_core.sh
```

Or rebuild both artifacts with:

```sh
./build_wasm.sh
```

The archive build uses the PEOPS GPU renderer, `-O3`, WebAssembly SIMD, and
no dynarec. The generated `.a`, object files, and final `.wasm`/`.js` outputs
are intentionally ignored or regenerated as part of the build.
