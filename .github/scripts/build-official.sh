#!/usr/bin/env bash
set -euo pipefail
mkdir -p .qa
curl -fsSL https://raw.githubusercontent.com/layabox/layaair-cli/master/install.sh -o /tmp/jade-laya-install.sh
bash /tmp/jade-laya-install.sh
export PATH="$HOME/.layaair:$PATH"
layaair install 3.4.0
layaair list
layaair --version=3.4.0 create JadeBracelet -t '2D empty project' -p ./official-project -s
# Bundle the actual tested game modules through the official IDE Web builder.
cp -R source/dist/js official-project/JadeBracelet/src/bracelet
python3 - <<'PY'
from pathlib import Path
for p in Path('official-project/JadeBracelet/src/bracelet').glob('*.js'):
    p.write_text(p.read_text().replace('?v=0.3.2',''))
entry=Path('official-project/JadeBracelet/src/bracelet/main.js')
text=entry.read_text()
start=text.index('boot().catch(e => {')
entry.write_text(text[:start]+'export { boot };\n')
PY
printf '%s\n' 'import { boot } from "./bracelet/main.js";' 'export class Main { onStart() { void boot(); } }' > official-project/JadeBracelet/src/Main.ts
JADE_WEB_OUTPUT="$(pwd)/official-web"
layaair --version=3.4.0 build web -p ./official-project/JadeBracelet -o "$JADE_WEB_OUTPUT" | tee .qa/official-build.log
test -s official-web/index.html
test -s official-web/libs/laya.core.js
test -s official-web/libs/laya.webgl_2D.js
# The existing standalone game owns Laya.init and its responsive stage. Keep that
# startup chain and module worker, with the freshly exported official engine.
mv source/dist source/compiled-app
mkdir -p source/dist/libs
cp -R official-web/libs/. source/dist/libs/
cp -R source/compiled-app/js source/compiled-app/assets source/dist/
cp source/compiled-app/index.html source/compiled-app/version.json source/dist/
cp source/public/libs/LICENSE-LayaAir source/dist/libs/
node .github/scripts/seal-release.cjs
