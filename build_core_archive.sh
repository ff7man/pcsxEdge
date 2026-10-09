#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${PCSX_REARMED_SOURCE:-$ROOT_DIR/core/pcsx-rearmed}"
OUTPUT_ARCHIVE="${CORE_ARCHIVE:-$ROOT_DIR/core/pcsx_rearmed_libretro_emscripten.a}"

if ! command -v emcc >/dev/null 2>&1 || ! command -v emar >/dev/null 2>&1; then
  echo "This build requires Emscripten (emcc and emar) in PATH." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_ARCHIVE")"

make -C "$SOURCE_DIR" -f Makefile.libretro \
  platform=emscripten \
  TARGET="$(basename "$OUTPUT_ARCHIVE")" \
  BUILTIN_GPU=peops \
  DYNAREC=0 \
  CFLAGS_OPT=-O3 \
  CC=emcc \
  CXX=em++ \
  CC_AS=emcc \
  AR=emar \
  all

if [[ "$SOURCE_DIR" != "$(dirname "$OUTPUT_ARCHIVE")" ]]; then
  cp "$SOURCE_DIR/$(basename "$OUTPUT_ARCHIVE")" "$OUTPUT_ARCHIVE"
fi

echo "Built $OUTPUT_ARCHIVE"
