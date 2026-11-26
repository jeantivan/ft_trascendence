#!/bin/sh
# Fails if a commit in base..head has a Co-Authored-By line (#299): AGENTS.md
# forbids that line, in any case and anywhere in the message.
# Usage: sh scripts/check-no-coauthor.sh <base> <head>
# The CI passes the base and head of the pull request. Before pushing a branch:
#   sh scripts/check-no-coauthor.sh origin/main HEAD
# Exit code: 0 no commit has the line, 1 some do (listed on stderr),
# 2 wrong usage or git cannot read base..head.
# Known limit: the repository allows squash merges, and a squash can add
# Co-authored-by to the new commit it writes in main, after this check has run.
# Merge and rebase keep the messages checked here. So far the team has always
# merged with merge; turning squash off is for whoever has admin (out of #299).

if [ "$#" -ne 2 ]; then
  echo "check-no-coauthor: usage: sh scripts/check-no-coauthor.sh <base> <head>" >&2
  exit 2
fi

# Checked on its own, before reading the messages: with git log | grep, sh only
# returns grep's code, and an unknown base would pass as "no line found"
git log --format=%H "$1..$2" > /dev/null || {
  echo "check-no-coauthor: cannot read the commits of $1..$2" >&2
  exit 2
}

# git already read this range above, so a pipe is safe here. tr: wc -l pads the
# number with spaces on macOS
count=$(git log --format=%H "$1..$2" | wc -l | tr -d ' ')
echo "check-no-coauthor: $count commits checked"

# for, not git log | while: the right side of a pipe runs in a subshell, and
# found would still be 0 after the loop. Hashes have no spaces, so
# splitting $hashes on whitespace gives one hash per turn
hashes=$(git log --format=%H "$1..$2")
found=0
for hash in $hashes; do
  if git log -1 --format=%B "$hash" | grep -qi '^co-authored-by:'; then
    if [ "$found" -eq 0 ]; then
      echo "check-no-coauthor: these commits have a Co-Authored-By line:" >&2
    fi
    git log -1 --format='  %h %s' "$hash" >&2
    found=1
  fi
done

if [ "$found" -eq 1 ]; then
  cat >&2 <<'EOF'
Rewrite their messages without that line:
  git commit --amend            if it is the last commit
  git rebase -i <base>          otherwise (mark them with reword)
and push the branch again with git push --force-with-lease.
GitHub adds the line when a review suggestion is applied with "Commit suggestion".
EOF
  exit 1
fi
