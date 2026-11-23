#!/bin/zsh
# Publishes the built app to a public GitHub Pages repo: Proto-Database-App by
# default, or another one named as the first argument (the online version goes
# to Proto-Database-Online). Only the built page and the files in site/ go there.
# The first run for a repo creates it and turns on Pages.
set -euo pipefail
cd "${0:A:h}/.."

repo=${1:-Myreknight/Proto-Database-App}
site=https://myreknight.github.io/${repo#*/}/
version=$(node -p "require('./package.json').version")

npm run build >/dev/null
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if gh repo view "$repo" >/dev/null 2>&1; then
  gh repo clone "$repo" "$work" -- -q --depth 1
  fresh=0
else
  git -C "$work" init -q -b main
  fresh=1
fi

# site/ holds everything else in the public repo (README, issue forms), so a
# file removed there is removed from the repo too.
find "$work" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R site/. "$work/"
cp "dist/Proto Database.html" "$work/index.html"

cd "$work"
git add -A
if git diff --cached --quiet; then
  echo "Already published: $version"
  exit 0
fi
git commit -q -m "Proto Database $version" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

if (( fresh )); then
  gh repo create "$repo" --public --description "Hosted build of Proto Database" --source . --push >/dev/null
  gh api "repos/$repo/pages" -X POST -f "source[branch]=main" -f "source[path]=/" >/dev/null
else
  git push -q
fi
# The feedback form's label (bug and enhancement are GitHub defaults)
gh label create feedback -R "$repo" --color c5def5 --description "General feedback from testers" --force >/dev/null
echo "Published $version to $site (live in a minute or two)"
