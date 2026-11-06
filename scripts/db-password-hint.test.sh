#!/bin/sh
# Tests for db-password-hint.sh. Usage: sh scripts/db-password-hint.test.sh

SCRIPT="$(cd "$(dirname "$0")" && pwd)/db-password-hint.sh"
failures=0

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

test_warns_when_postgres_rejects_the_password() {
  output=$(echo "Error: P1000: Authentication failed against database server" | sh "$SCRIPT" 2>&1)
  case "$output" in
    *"WARNING: PostgreSQL rejected the user or password"*"make fclean"*) ;;
    *) fail "warns and explains make fclean when the logs show P1000" ;;
  esac
}

test_stays_silent_on_other_errors() {
  output=$(echo "Error: P3009: migrate found failed migrations" | sh "$SCRIPT" 2>&1)
  if [ -n "$output" ]; then
    fail "says nothing when the logs show a different error"
  fi
}

test_warns_when_postgres_rejects_the_password
test_stays_silent_on_other_errors

if [ "$failures" -eq 0 ]; then
  echo "All tests passed"
else
  echo "$failures test(s) failed"
  exit 1
fi
