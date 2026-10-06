#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_root="$repo_root/build/lambda-package"
package_zip="$repo_root/build/knowledgellm-lambda.zip"

rm -rf "$package_root"
mkdir -p "$package_root/src" "$repo_root/build"
pip --python "$(command -v python3.12)" install \
  --requirement "$repo_root/api/lambda-requirements.txt" \
  --target "$package_root" \
  --platform manylinux_2_28_x86_64 \
  --platform manylinux_2_17_x86_64 \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all:
cp -R "$repo_root/api/src/knowledgellm" "$package_root/src/knowledgellm"
rm -f "$package_zip"
python3.12 - "$package_root" "$package_zip" <<'PY'
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1])
archive = Path(sys.argv[2])
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
    for path in root.rglob("*"):
        if path.is_file():
            output.write(path, path.relative_to(root))
    uncompressed_size = sum(item.file_size for item in output.infolist())

limit = 250 * 1024 * 1024
if uncompressed_size > limit:
    archive.unlink()
    raise SystemExit(f"Lambda package is {uncompressed_size:,} bytes; the uncompressed limit is {limit:,} bytes.")
print(f"Uncompressed Lambda package: {uncompressed_size / (1024 * 1024):.1f} MiB")
PY
printf 'Created %s\n' "$package_zip"
