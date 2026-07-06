#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Local mac desktop builds must run on macOS." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

# Build exactly the local mac desktop artifacts:
# - mac targets only, no Linux/Windows/package publishing
# - ad-hoc signing only, no Developer ID certificate lookup
# - hardened runtime and notarization disabled for local unsigned builds
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:desktop -- --mac --publish never -c.mac.hardenedRuntime=false -c.mac.notarize=false

version="$(node -p "require('./package.json').version")"
release_dir="packages/desktop/release"
dmg_path="${release_dir}/Paseo-${version}-arm64.dmg"
zip_path="${release_dir}/Paseo-${version}-arm64.zip"
unpacked_dir="${release_dir}/mac-arm64"
app_path="${unpacked_dir}/Paseo.app"
electron_framework_path="${app_path}/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"

if [[ ! -f "${dmg_path}" ]]; then
  echo "Expected mac DMG artifact not found: ${dmg_path}" >&2
  exit 1
fi

if [[ ! -f "${zip_path}" ]]; then
  echo "Expected mac ZIP artifact not found: ${zip_path}" >&2
  exit 1
fi

# Electron Builder writes the unpacked app during packaging, then DMG creation
# may leave the directory incomplete. Rehydrate it from the final ZIP so
# release/mac-arm64 always contains the same app the ZIP contains.
rm -rf "${unpacked_dir}"
mkdir -p "${unpacked_dir}"
ditto -x -k "${zip_path}" "${unpacked_dir}"

required_file="${unpacked_dir}/Paseo.app/Contents/Resources/app.asar.unpacked/node_modules/@getpaseo/server/dist/server/terminal/shell-integration/zsh/.zshenv"
if [[ ! -f "${required_file}" ]]; then
  echo "Packaged zsh shell integration is missing: ${required_file}" >&2
  exit 1
fi

verify_adhoc_without_runtime() {
  local target="$1"
  local label="$2"
  local output

  output="$(codesign -dv --verbose=4 "${target}" 2>&1)"
  if ! grep -q "Signature=adhoc" <<<"${output}"; then
    echo "${label} is not ad-hoc signed." >&2
    echo "${output}" >&2
    exit 1
  fi
  if ! grep -q "TeamIdentifier=not set" <<<"${output}"; then
    echo "${label} unexpectedly has a signing team." >&2
    echo "${output}" >&2
    exit 1
  fi
  if grep -q "flags=.*runtime" <<<"${output}"; then
    echo "${label} unexpectedly has hardened runtime enabled." >&2
    echo "${output}" >&2
    exit 1
  fi
}

verify_adhoc_without_runtime "${app_path}" "Paseo.app"
verify_adhoc_without_runtime "${electron_framework_path}" "Electron Framework"

echo "Built local mac artifacts:"
echo "  ${dmg_path}"
echo "  ${zip_path}"
echo "  ${app_path}"

open -R "${app_path}"
