#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="arc-cleanup-v32-${STAMP}.log"

exec > >(tee -a "$LOG") 2>&1

echo "ARC V32 cleanup started at ${STAMP}"
echo "Project root: ${ROOT}"

# 0. Safety checks: this script must run at the React/Vite project root.
required_files=(
  "package.json"
  "index.html"
  "tsconfig.json"
  "vite.config.ts"
  "src/App.tsx"
  "src/main.tsx"
  "src/components/SearchInput.tsx"
  "src/pages/PaymentPage.tsx"
  "src/pages/CaseRegistrationPage.tsx"
  "src/pages/FaxPickupPage.tsx"
  "src/pages/SettingsPage.tsx"
  "src/styles.css"
  "public/icons/總覽.png"
)

missing=0
for f in "${required_files[@]}"; do
  if [ ! -e "$f" ]; then
    echo "MISSING: $f"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "ABORT: 必要檔案不存在。請先確認完整正式版已解壓到根目錄，再執行清理。"
  exit 1
fi

# 1. Ensure .gitignore protects runtime/temp files.
touch .gitignore
cat >> .gitignore <<'GITIGNORE_EOF'

# ARC cleanup ignored files
.env
.env.local
node_modules
dist
*.zip
*.bak
*.tmp
*.old
*.orig
*.tsbuildinfo
arc-cleanup-v32-*.log
GITIGNORE_EOF

# 2. Create local backup archive. Exclude bulky/cache/sensitive files.
mkdir -p .arc-cleanup-backup
tar \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./.env.local' \
  --exclude='./.arc-cleanup-backup' \
  --exclude='./*.zip' \
  -czf ".arc-cleanup-backup/arc-before-cleanup-${STAMP}.tar.gz" .

echo "Backup created: .arc-cleanup-backup/arc-before-cleanup-${STAMP}.tar.gz"

# 3. Create git backup branch from current HEAD when git is available.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  CURRENT_BRANCH="$(git branch --show-current || true)"
  BACKUP_BRANCH="backup/arc-cleanup-${STAMP}"
  git branch "$BACKUP_BRANCH" || true
  echo "Git backup branch created: $BACKUP_BRANCH"
  echo "Current branch: ${CURRENT_BRANCH:-unknown}"
fi

# 4. Remove root-level old packages, temporary build artifacts, duplicated extraction folders.
echo "Finding removable root-level files/folders..."

# root-level temp files
find . -maxdepth 1 -type f \
  \( -iname '*.zip' \
     -o -iname '*backup*' \
     -o -iname '*before*' \
     -o -iname '*old*' \
     -o -iname '*patch*' \
     -o -iname '*fix*' \
     -o -iname '*test*' \
     -o -iname '*.bak' \
     -o -iname '*.tmp' \
     -o -iname '*.orig' \
     -o -iname '*.tsbuildinfo' \
     -o -name 'BUILD_CHECK.txt' \
     -o -name 'README-LOGIN-SETUP.txt' \
  \) \
  ! -name '.env' ! -name '.env.local' ! -name '.gitignore' ! -name 'package.json' ! -name 'package-lock.json' ! -name 'README.md' \
  -print -delete

# root-level duplicated extraction/work folders only. Do not remove src/public/supabase/scripts.
find . -maxdepth 1 -type d \
  \( -name 'arc_v*_work' \
     -o -name 'arc_v*_changed' \
     -o -name 'work_v*' \
     -o -name 'arc-v13-formal-v*' \
     -o -name 'arc-v13-formal' \
     -o -name 'backup*' \
     -o -name 'old*' \
     -o -name 'patch*' \
     -o -name 'test*' \
  \) \
  ! -name '.' ! -name './src' ! -name './public' ! -name './supabase' ! -name './scripts' ! -name './.git' ! -name './.arc-cleanup-backup' \
  -print -exec rm -rf {} +

# 5. Remove debugger and simple one-line console test logs in source only.
echo "Cleaning debugger and one-line console.log/debug statements in src..."
if [ -d src ]; then
  find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) -print0 \
    | xargs -0 perl -0pi -e 's/^\s*debugger;\s*\n//mg; s/^\s*console\.(log|debug)\([^\n;]*\);\s*\n//mg'
fi

# 6. Reference and residue checks. These do not fail unless critical search files are damaged.
echo "Checking known bad residue..."
grep -RIn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  "renderUserManagement is not defined\|renderUserManagement\|innerHTML[[:space:]]*=\|debugger" src public index.html || true

# 7. Search/IME logic must remain.
echo "Checking SearchInput IME logic..."
for token in compositionstart compositionupdate compositionend isComposing; do
  if ! grep -R "$token" src/components/SearchInput.tsx >/dev/null 2>&1; then
    echo "ABORT: SearchInput missing ${token}. Do not deploy until fixed."
    exit 1
  fi
done

echo "SearchInput IME logic OK"

# 8. Keep npm registry clean.
cat > .npmrc <<'NPMRC_EOF'
registry=https://registry.npmjs.org/
audit=false
fund=false
legacy-peer-deps=true
NPMRC_EOF

rm -rf node_modules dist
rm -f package-lock.json
npm cache clean --force
npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund --legacy-peer-deps

if grep -R "applied-caas\|openai.org/artifactory" package-lock.json .npmrc >/dev/null 2>&1; then
  echo "ABORT: package-lock 或 .npmrc 仍含內部 registry。"
  grep -R "applied-caas\|openai.org/artifactory" package-lock.json .npmrc || true
  exit 1
fi

echo "registry OK"

# 9. Build check.
npm run build

echo "ARC V32 cleanup completed. Review git diff before commit."
echo "Log: ${LOG}"
