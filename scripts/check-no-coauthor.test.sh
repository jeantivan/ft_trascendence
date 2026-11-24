#!/bin/sh
# Tests for check-no-coauthor.sh. Usage: sh scripts/check-no-coauthor.test.sh
# The real repository is never changed.

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-no-coauthor.sh"
failures=0

# An empty temporary git repository, and move into it. The identity is set only
# in this repository: the CI has none, and git commit needs one
setup() {
  tmp=$(mktemp -d) || exit 1
  cd "$tmp" || exit 1
  # -b main: without it the first branch is master or main, depending on the machine
  git init -q -b main
  git config user.name "Test"
  git config user.email "test@example.com"
}

teardown() {
  cd / && rm -rf "$tmp"
}

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

test_usage_error_without_arguments() {
  err=$(mktemp)
  sh "$SCRIPT" 2> "$err"
  code=$?
  if [ "$code" -ne 2 ] || ! grep -q 'usage:' "$err"; then
    fail "exits with 2 and prints the usage without arguments (exit $code)"
  fi
  rm -f "$err"
}

test_usage_error_with_one_argument() {
  err=$(mktemp)
  sh "$SCRIPT" abc123 2> "$err"
  code=$?
  if [ "$code" -ne 2 ] || ! grep -q 'usage:' "$err"; then
    fail "exits with 2 and prints the usage with one argument (exit $code)"
  fi
  rm -f "$err"
}

# What a CI checkout with only the last commit gives: git does not know base
test_git_error_with_unknown_base() {
  setup
  git commit -q --allow-empty -m "first"
  err=$(mktemp)
  sh "$SCRIPT" 0000000000000000000000000000000000000000 HEAD 2> "$err"
  code=$?
  if [ "$code" -ne 2 ] || ! grep -q 'cannot read the commits' "$err"; then
    fail "exits with 2 when git does not know base (exit $code)"
  fi
  rm -f "$err"
  teardown
}

test_clean_range_passes_and_prints_the_count() {
  setup
  git commit -q --allow-empty -m "base"
  base=$(git rev-parse HEAD)
  git commit -q --allow-empty -m "one"
  git commit -q --allow-empty -m "two"
  git commit -q --allow-empty -m "three"
  out=$(sh "$SCRIPT" "$base" HEAD)
  code=$?
  if [ "$code" -ne 0 ] || ! echo "$out" | grep -q '3 commits checked'; then
    fail "passes a clean range and prints how many commits it checked (exit $code)"
  fi
  teardown
}

test_fails_and_names_the_commit_with_the_line() {
  setup
  git commit -q --allow-empty -m "base"
  base=$(git rev-parse HEAD)
  git commit -q --allow-empty -m "clean one"
  # Two -m: the line goes in its own last paragraph, as an agent writes it
  git commit -q --allow-empty -m "feat: culprit" -m "Co-Authored-By: X <x@example.com>"
  culprit=$(git rev-parse --short HEAD)
  err=$(mktemp)
  sh "$SCRIPT" "$base" HEAD > /dev/null 2> "$err"
  code=$?
  if [ "$code" -ne 1 ]; then
    fail "exits with 1 when a commit has the line (exit $code)"
  fi
  if ! grep -q "$culprit feat: culprit" "$err"; then
    fail "names the hash and subject of the commit with the line"
  fi
  if grep -q 'clean one' "$err"; then
    fail "does not name the commits without the line"
  fi
  if ! grep -q -e '--force-with-lease' "$err" || ! grep -q 'Commit suggestion' "$err"; then
    fail "says how to fix it and mentions Commit suggestion"
  fi
  rm -f "$err"
  teardown
}

# Like the commits of #299 itself: they talk about the line without having it.
# With the colon, or the test would pass even if the script searched anywhere
test_passes_when_a_subject_only_mentions_the_line() {
  setup
  git commit -q --allow-empty -m "base"
  base=$(git rev-parse HEAD)
  git commit -q --allow-empty -m "docs: explain the Co-Authored-By: line rule"
  sh "$SCRIPT" "$base" HEAD > /dev/null 2>&1
  code=$?
  if [ "$code" -ne 0 ]; then
    fail "passes when a subject only mentions Co-Authored-By: (exit $code)"
  fi
  teardown
}

# git and GitHub read the key without telling upper and lower case apart
test_fails_with_the_line_in_any_case() {
  setup
  git commit -q --allow-empty -m "base"
  base=$(git rev-parse HEAD)
  git commit -q --allow-empty -m "lower" -m "co-authored-by: X <x@example.com>"
  git commit -q --allow-empty -m "upper" -m "CO-AUTHORED-BY: X <x@example.com>"
  err=$(mktemp)
  sh "$SCRIPT" "$base" HEAD > /dev/null 2> "$err"
  code=$?
  if [ "$code" -ne 1 ] || ! grep -q ' lower$' "$err" || ! grep -q ' upper$' "$err"; then
    fail "fails and names the commits with the line in lower and upper case (exit $code)"
  fi
  rm -f "$err"
  teardown
}

# AGENTS.md forbids the line, not only the trailer: a line in the middle of the
# message counts too, although git does not read it as a trailer
test_fails_with_the_line_in_the_middle_of_the_message() {
  setup
  git commit -q --allow-empty -m "base"
  base=$(git rev-parse HEAD)
  git commit -q --allow-empty -m "middle" -m "Co-Authored-By: X <x@example.com>" -m "More text after it."
  sh "$SCRIPT" "$base" HEAD > /dev/null 2>&1
  code=$?
  if [ "$code" -ne 1 ]; then
    fail "fails with the line in the middle of the message (exit $code)"
  fi
  teardown
}

# Like the 15 commits already in main: the line is before base, not in the PR
test_passes_when_the_line_is_only_before_base() {
  setup
  git commit -q --allow-empty -m "old" -m "Co-Authored-By: X <x@example.com>"
  git commit -q --allow-empty -m "base"
  base=$(git rev-parse HEAD)
  git commit -q --allow-empty -m "clean"
  sh "$SCRIPT" "$base" HEAD > /dev/null 2>&1
  code=$?
  if [ "$code" -ne 0 ]; then
    fail "passes when the line is only in commits before base (exit $code)"
  fi
  teardown
}

# The branch brings main in with a merge after main got a commit with the line.
# base is the tip of main, as pull_request.base.sha after that push
test_passes_when_the_line_comes_from_merging_main() {
  setup
  git commit -q --allow-empty -m "start"
  git switch -q -c feature
  git commit -q --allow-empty -m "feature work"
  git switch -q main
  git commit -q --allow-empty -m "on main" -m "Co-Authored-By: X <x@example.com>"
  base=$(git rev-parse main)
  git switch -q feature
  git merge -q --no-edit main
  sh "$SCRIPT" "$base" HEAD > /dev/null 2>&1
  code=$?
  if [ "$code" -ne 0 ]; then
    fail "passes when the line only comes in by merging main (exit $code)"
  fi
  teardown
}

test_usage_error_without_arguments
test_usage_error_with_one_argument
test_git_error_with_unknown_base
test_clean_range_passes_and_prints_the_count
test_fails_and_names_the_commit_with_the_line
test_passes_when_a_subject_only_mentions_the_line
test_fails_with_the_line_in_any_case
test_fails_with_the_line_in_the_middle_of_the_message
test_passes_when_the_line_is_only_before_base
test_passes_when_the_line_comes_from_merging_main

if [ "$failures" -eq 0 ]; then
  echo "All tests passed"
else
  echo "$failures test(s) failed"
  exit 1
fi
