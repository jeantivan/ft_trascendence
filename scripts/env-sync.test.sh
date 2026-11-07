#!/bin/sh
# Tests for env-sync.sh. Usage: sh scripts/env-sync.test.sh
# Each test runs the script in its own temporary folder with made-up
# .env.example and .env files: the real .env is never read or changed.

SCRIPT="$(cd "$(dirname "$0")" && pwd)/env-sync.sh"
EXAMPLE="$(cd "$(dirname "$0")/.." && pwd)/.env.example"
failures=0

# Create an empty temporary folder and move into it
setup() {
  tmp=$(mktemp -d)
  cd "$tmp" || exit 1
}

teardown() {
  cd / && rm -rf "$tmp"
}

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

test_creates_env_from_example_when_missing() {
  setup
  printf '# comment\nA=1\nB=2\n' > .env.example
  sh "$SCRIPT"
  if ! cmp -s .env .env.example; then
    fail "creates .env as a copy of .env.example when it does not exist"
  fi
  teardown
}

test_adds_missing_variables() {
  setup
  printf '# comment\nA=1\nB=2\n' > .env.example
  printf 'A=1\n' > .env
  sh "$SCRIPT"
  if [ "$(cat .env)" != "$(printf 'A=1\nB=2')" ]; then
    fail "adds to .env the variables of .env.example that are missing"
  fi
  teardown
}

test_keeps_existing_values() {
  setup
  printf 'A=1\nB=2\n' > .env.example
  printf 'A=mine\nB=2\n' > .env
  sh "$SCRIPT"
  if [ "$(cat .env)" != "$(printf 'A=mine\nB=2')" ]; then
    fail "never changes the values that .env already has"
  fi
  teardown
}

test_generates_empty_auth_secret() {
  setup
  printf 'A=1\nAUTH_SECRET=\n' > .env.example
  sh "$SCRIPT"
  # openssl rand -base64 33 gives 44 base64 characters
  if ! grep -Eq '^AUTH_SECRET=[A-Za-z0-9+/]{44}$' .env; then
    fail "fills an empty AUTH_SECRET with a random key"
  fi
  teardown
}

test_generates_empty_auth_secret_with_windows_line_ending() {
  setup
  printf 'AUTH_SECRET=\n' > .env.example
  # An editor on Windows may save .env with CRLF line endings
  printf 'AUTH_SECRET=\r\n' > .env
  sh "$SCRIPT"
  if ! grep -Eq '^AUTH_SECRET=[A-Za-z0-9+/]{44}$' .env; then
    fail "fills an empty AUTH_SECRET saved with a Windows line ending"
  fi
  teardown
}

test_keeps_existing_auth_secret_with_windows_line_ending() {
  setup
  printf 'AUTH_SECRET=\n' > .env.example
  printf 'AUTH_SECRET=mykey\r\n' > .env
  cp .env before
  sh "$SCRIPT"
  if ! cmp -s .env before; then
    fail "never regenerates an AUTH_SECRET with a value and a Windows line ending"
  fi
  teardown
}

test_keeps_existing_auth_secret() {
  setup
  printf 'AUTH_SECRET=\n' > .env.example
  printf 'AUTH_SECRET=mykey\n' > .env
  sh "$SCRIPT"
  if [ "$(cat .env)" != "AUTH_SECRET=mykey" ]; then
    fail "never regenerates an AUTH_SECRET that already has a value"
  fi
  teardown
}

test_generates_empty_postgres_password() {
  setup
  printf 'A=1\nPOSTGRES_PASSWORD=\n' > .env.example
  sh "$SCRIPT"
  # Hexadecimal: it goes inside DATABASE_URL, where symbols break the URL
  if ! grep -Eq '^POSTGRES_PASSWORD=[0-9a-f]{64}$' .env; then
    fail "fills an empty POSTGRES_PASSWORD with 64 hexadecimal characters"
  fi
  teardown
}

test_generates_a_different_postgres_password_each_time() {
  setup
  printf 'POSTGRES_PASSWORD=\n' > .env.example
  sh "$SCRIPT"
  first=$(cat .env)
  rm .env
  sh "$SCRIPT"
  if [ "$(cat .env)" = "$first" ]; then
    fail "generates a different POSTGRES_PASSWORD for each new .env"
  fi
  teardown
}

test_generates_empty_postgres_password_with_windows_line_ending() {
  setup
  printf 'POSTGRES_PASSWORD=\n' > .env.example
  printf 'POSTGRES_PASSWORD=\r\n' > .env
  sh "$SCRIPT"
  if ! grep -Eq '^POSTGRES_PASSWORD=[0-9a-f]{64}$' .env; then
    fail "fills an empty POSTGRES_PASSWORD saved with a Windows line ending"
  fi
  teardown
}

test_keeps_existing_postgres_password() {
  setup
  printf 'POSTGRES_PASSWORD=\n' > .env.example
  # Changing it would break the connection: Postgres only reads it when it creates its data
  printf 'POSTGRES_PASSWORD=dev_password_local_only\n' > .env
  cp .env before
  sh "$SCRIPT"
  if ! cmp -s .env before; then
    fail "never changes a POSTGRES_PASSWORD that already has a value"
  fi
  teardown
}

test_fails_when_postgres_password_cannot_be_generated() {
  setup
  printf 'POSTGRES_PASSWORD=\n' > .env.example
  # Fake openssl that always fails, found first in PATH
  mkdir bin
  printf '#!/bin/sh\nexit 1\n' > bin/openssl
  chmod +x bin/openssl
  if PATH="$tmp/bin:$PATH" sh "$SCRIPT" 2> /dev/null; then
    fail "stops with an error when openssl cannot generate POSTGRES_PASSWORD"
  fi
  teardown
}

test_example_leaves_postgres_password_empty() {
  if ! grep -q '^POSTGRES_PASSWORD=$' "$EXAMPLE"; then
    fail "the real .env.example leaves POSTGRES_PASSWORD empty"
  fi
}

test_generates_empty_mailpit_password() {
  setup
  printf 'A=1\nMAILPIT_PASSWORD=\n' > .env.example
  sh "$SCRIPT"
  if ! grep -Eq '^MAILPIT_PASSWORD=[0-9a-f]{8}$' .env; then
    fail "fills an empty MAILPIT_PASSWORD with 8 hexadecimal characters"
  fi
  teardown
}

test_adds_and_generates_mailpit_password_in_existing_env() {
  setup
  printf 'A=1\nMAILPIT_PASSWORD=\n' > .env.example
  # A .env from before Mailpit existed: the variable is added and then generated
  printf 'A=mine\n' > .env
  sh "$SCRIPT"
  if ! grep -q '^A=mine$' .env || ! grep -Eq '^MAILPIT_PASSWORD=[0-9a-f]{8}$' .env; then
    fail "adds MAILPIT_PASSWORD to a .env without it, generated and keeping the rest"
  fi
  teardown
}

test_keeps_existing_mailpit_password() {
  setup
  printf 'MAILPIT_PASSWORD=\n' > .env.example
  printf 'MAILPIT_PASSWORD=mine\n' > .env
  cp .env before
  sh "$SCRIPT"
  if ! cmp -s .env before; then
    fail "never changes a MAILPIT_PASSWORD that already has a value"
  fi
  teardown
}

test_example_leaves_mailpit_password_empty() {
  if ! grep -q '^MAILPIT_PASSWORD=$' "$EXAMPLE"; then
    fail "the real .env.example leaves MAILPIT_PASSWORD empty"
  fi
}

test_second_run_changes_nothing() {
  setup
  printf 'A=1\nAUTH_SECRET=\nPOSTGRES_PASSWORD=\nMAILPIT_PASSWORD=\n' > .env.example
  sh "$SCRIPT"
  cp .env first-run
  sh "$SCRIPT"
  if ! cmp -s .env first-run; then
    fail "running it again leaves .env as it was"
  fi
  teardown
}

test_adds_on_new_line_when_last_line_has_no_newline() {
  setup
  printf 'A=1\nB=2\n' > .env.example
  printf 'A=1' > .env
  sh "$SCRIPT"
  if [ "$(cat .env)" != "$(printf 'A=1\nB=2')" ]; then
    fail "adds the missing variables on a new line when .env does not end in a newline"
  fi
  teardown
}

test_fails_when_secret_cannot_be_generated() {
  setup
  printf 'AUTH_SECRET=\n' > .env.example
  # Fake openssl that always fails, found first in PATH
  mkdir bin
  printf '#!/bin/sh\nexit 1\n' > bin/openssl
  chmod +x bin/openssl
  if PATH="$tmp/bin:$PATH" sh "$SCRIPT" 2> /dev/null; then
    fail "stops with an error when openssl cannot generate AUTH_SECRET"
  fi
  teardown
}

test_fails_without_example() {
  setup
  if sh "$SCRIPT" 2> /dev/null || [ -f .env ]; then
    fail "stops with an error and creates no .env when .env.example is missing"
  fi
  teardown
}

test_keeps_env_when_rewrite_fails() {
  setup
  printf 'A=1\nAUTH_SECRET=\n' > .env.example
  cp .env.example .env
  # Fake sed that always fails, found first in PATH
  mkdir bin
  printf '#!/bin/sh\nexit 1\n' > bin/sed
  chmod +x bin/sed
  if PATH="$tmp/bin:$PATH" sh "$SCRIPT" 2> /dev/null; then
    fail "stops with an error when .env cannot be rewritten"
  fi
  if ! cmp -s .env .env.example; then
    fail "leaves .env as it was when the rewrite fails"
  fi
  if [ -e .env.tmp ]; then
    fail "leaves no .env.tmp behind when the rewrite fails"
  fi
  teardown
}

test_new_env_is_readable_only_by_owner() {
  setup
  printf 'A=1\n' > .env.example
  # The usual default umask, so the test does not depend on the user's own.
  # The parentheses keep it from leaking into the other tests.
  (umask 022; sh "$SCRIPT")
  if [ "$(ls -l .env | cut -c1-10)" != "-rw-------" ]; then
    fail "creates .env readable and writable only by its owner"
  fi
  teardown
}

test_existing_env_becomes_readable_only_by_owner() {
  setup
  printf 'A=1\n' > .env.example
  printf 'A=1\n' > .env
  chmod 644 .env
  sh "$SCRIPT"
  if [ "$(ls -l .env | cut -c1-10)" != "-rw-------" ]; then
    fail "makes an existing .env readable and writable only by its owner"
  fi
  teardown
}

test_creates_env_from_example_when_missing
test_adds_missing_variables
test_keeps_existing_values
test_generates_empty_auth_secret
test_generates_empty_auth_secret_with_windows_line_ending
test_keeps_existing_auth_secret
test_keeps_existing_auth_secret_with_windows_line_ending
test_generates_empty_postgres_password
test_generates_a_different_postgres_password_each_time
test_generates_empty_postgres_password_with_windows_line_ending
test_keeps_existing_postgres_password
test_fails_when_postgres_password_cannot_be_generated
test_example_leaves_postgres_password_empty
test_generates_empty_mailpit_password
test_adds_and_generates_mailpit_password_in_existing_env
test_keeps_existing_mailpit_password
test_example_leaves_mailpit_password_empty
test_second_run_changes_nothing
test_adds_on_new_line_when_last_line_has_no_newline
test_fails_when_secret_cannot_be_generated
test_fails_without_example
test_keeps_env_when_rewrite_fails
test_new_env_is_readable_only_by_owner
test_existing_env_becomes_readable_only_by_owner

if [ "$failures" -eq 0 ]; then
  echo "All tests passed"
else
  echo "$failures test(s) failed"
  exit 1
fi
