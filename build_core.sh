#!/usr/bin/env bash
set -euo pipefail

# Build the browser wrapper against an already-built PEOPS PCSX-ReARMed
# libretro archive. Set CORE_ARCHIVE when the source tree is elsewhere.
CORE_ARCHIVE="${CORE_ARCHIVE:-core/pcsx_rearmed_libretro_emscripten.a}"

emcc -O3 -msimd128 -Icore -c core/browser_shim.c -o core/browser_shim.o
emcc -O3 -msimd128 --no-entry -sWASM=1 \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=536870912 \
  -sUSE_ZLIB=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","FS","HEAPU8","HEAPU16","HEAP16","HEAP32","HEAPU32"]' \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_frontend_init","_frontend_load_game","_frontend_run","_frontend_unload_game","_frontend_deinit","_frontend_save_ram_ptr","_frontend_save_ram_size","_frontend_memory_card_ptr","_frontend_memory_card_size","_frontend_serialize_size","_frontend_serialize","_frontend_unserialize"]' \
  core/browser_shim.o "$CORE_ARCHIVE" -o core/pcsx_rearmed_peops.js
