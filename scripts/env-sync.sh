#!/bin/sh
# Keep .env in step with .env.example. Run by make and make dev before starting.

# Stop at the first failing command, so .env is never replaced by a broken copy,
# and always remove the temporary file (it may hold the secret)
set -e
trap 'rm -f .env.tmp' EXIT

# .env holds secrets: files created here are readable only by their owner
umask 077

if [ ! -f .env.example ]; then
  echo "env-sync: .env.example not found. Run it from the project root." >&2
  exit 1
fi

# First run: create .env from the template
if [ ! -f .env ]; then
  cp .env.example .env
fi

# An older .env may have been created readable by everyone: close it too
chmod 600 .env

# If the last line has no newline, add one so appended lines do not stick to it
if [ -s .env ] && [ -n "$(tail -c 1 .env)" ]; then
  echo >> .env
fi

# Append the variables of the template that .env does not have yet
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.example | while IFS= read -r line; do
  name=${line%%=*}
  if ! grep -q "^$name=" .env; then
    echo "$line" >> .env
  fi
done

# Secrets cannot live in the template (they would be public): generate them if empty.
# sed writes to a temporary file because "sed -i" differs between Linux and macOS.
# The line may end in a carriage return if .env was saved on Windows; "\r" is not
# portable in grep or sed, so the character is kept in a variable.
cr=$(printf '\r')
fill_if_empty() {
  name=$1
  shift
  empty_line_pattern="^$name=$cr*\$"
  if grep -q "$empty_line_pattern" .env; then
    if ! value=$(openssl rand "$@") || [ -z "$value" ]; then
      echo "env-sync: could not generate $name. Is openssl installed?" >&2
      exit 1
    fi
    sed "s|$empty_line_pattern|$name=$value|" .env > .env.tmp
    mv .env.tmp .env
  fi
}

fill_if_empty AUTH_SECRET -base64 33
# Hexadecimal: the password goes inside DATABASE_URL, where symbols like @ or / break the URL.
# Postgres only reads it when it creates its data, so a password with a value is never changed.
fill_if_empty POSTGRES_PASSWORD -hex 32
