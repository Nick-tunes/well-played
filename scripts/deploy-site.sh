#!/bin/sh
# Publish the static site to Cloudflare Pages (well-played.win).
# Copies only the files the app needs into dist/, then uploads them.
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp -R index.html icon.svg manifest.webmanifest sw.js css js dist/
npx --yes wrangler@3 pages deploy dist --project-name well-played --branch main --commit-dirty=true
