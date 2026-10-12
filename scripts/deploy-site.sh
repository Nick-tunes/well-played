#!/bin/sh
# Publish the static site to Cloudflare Pages (well-played.win).
# Copies only the files the app needs into dist/, stamps asset URLs with a version so
# browsers can never run a stale mix of old and new files, then uploads.
set -e
cd "$(dirname "$0")/.."
node scripts/build-cosmetics.mjs
rm -rf dist && mkdir -p dist
cp -R index.html icon.svg manifest.webmanifest sw.js _headers css js dist/
STAMP=$(date +%Y%m%d%H%M%S)
sed -i '' -E "s#(href|src)=\"((css|js)/[^\"?]+\.(css|js))\"#\1=\"\2?v=${STAMP}\"#g" dist/index.html
npx --yes wrangler@3 pages deploy dist --project-name well-played --branch main --commit-dirty=true
