#!/usr/bin/env bash
set -euo pipefail
mkdir -p .qa
curl -fsSL https://raw.githubusercontent.com/layabox/layaair-cli/master/install.sh -o /tmp/jade-laya-install.sh
bash /tmp/jade-laya-install.sh
export PATH="$HOME/.layaair:$PATH"
layaair install 3.4.0
layaair list
# Use the actual checked-in .laya project and its game startup scene.
(cd source && npm run release:web) | tee .qa/official-build.log
test -s source/.release-out/web/index.html
test -s source/.release-out/web/js/bundle.js
test -s source/.release-out/web/libs/laya.core.js
python3 - <<'PY'
from pathlib import Path
import shutil
target=Path('source/dist')
if target.exists(): shutil.rmtree(target)
shutil.copytree('source/.release-out/web',target)
shutil.copyfile('source/public/libs/LICENSE-LayaAir',target/'libs/LICENSE-LayaAir')
PY
node .github/scripts/seal-release.cjs
