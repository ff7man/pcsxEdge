#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$ROOT_DIR/build_core_archive.sh"
"$ROOT_DIR/build_core.sh"

echo "Built $ROOT_DIR/core/pcsx_rearmed_peops.js and .wasm"
