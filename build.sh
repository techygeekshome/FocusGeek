#!/usr/bin/env bash
# Builds the release packages into dist/.
#   FocusGeek.zip          Chrome, Edge, Brave, Opera, Vivaldi (unzip, then Load unpacked)
#   FocusGeek-chrome.zip   same files, named for Chrome users
#   FocusGeek-edge.zip     same files, named for Edge users
#   FocusGeek-firefox.zip  Firefox package (Firefox manifest, files at the root)
set -euo pipefail
cd "$(dirname "$0")"
FILES="background.js common.js popup.html popup.js ui.css options.html options.js blocked.html blocked.css blocked.js icons"
OUT=dist; TMP=$(mktemp -d)
mkdir -p "$OUT"
rm -f "$OUT"/FocusGeek*.zip

mkdir "$TMP/focusgeek"
cp -r $FILES manifest.json LICENSE "$TMP/focusgeek/"
(cd "$TMP" && zip -qr -X -9 pkg.zip focusgeek)
for n in FocusGeek FocusGeek-chrome FocusGeek-edge; do cp "$TMP/pkg.zip" "$OUT/$n.zip"; done

mkdir "$TMP/ff"
cp -r $FILES LICENSE "$TMP/ff/"
cp manifest.firefox.json "$TMP/ff/manifest.json"
(cd "$TMP/ff" && zip -qr -X -9 ../ff.zip .)
cp "$TMP/ff.zip" "$OUT/FocusGeek-firefox.zip"

rm -r "$TMP"
ls -l "$OUT"
