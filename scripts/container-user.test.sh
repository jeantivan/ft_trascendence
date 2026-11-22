#!/bin/sh
# Tests for container-user.sh. Usage: sh scripts/container-user.test.sh
# Each test puts a fake docker first in PATH, so the real Docker is never asked.

SCRIPT="$(cd "$(dirname "$0")" && pwd)/container-user.sh"
failures=0

setup() {
  tmp=$(mktemp -d)
  mkdir "$tmp/bin"
}

teardown() {
  rm -rf "$tmp"
}

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

# Fake docker: only "docker info" prints $1 and exits with $2; any other command
# fails, so a typo in the script's docker command makes the tests fail
fake_docker() {
  printf '#!/bin/sh\n[ "$1" = info ] || { echo "fake docker: unexpected $*" >&2; exit 2; }\necho "%s"\nexit %s\n' "$1" "$2" > "$tmp/bin/docker"
  chmod +x "$tmp/bin/docker"
}

test_rootless_docker_gives_root() {
  setup
  # What a campus computer prints (Docker 28, rootless)
  fake_docker '[name=seccomp,profile=builtin name=rootless name=cgroupns]' 0
  if [ "$(PATH="$tmp/bin:$PATH" sh "$SCRIPT")" != "root" ]; then
    fail "says root when Docker runs rootless"
  fi
  teardown
}

test_normal_docker_gives_nothing() {
  setup
  # What a normal Docker prints: the compose files then keep their default user (node)
  fake_docker '[name=seccomp,profile=builtin name=cgroupns]' 0
  if [ -n "$(PATH="$tmp/bin:$PATH" sh "$SCRIPT")" ]; then
    fail "says nothing when Docker is not rootless"
  fi
  teardown
}

test_docker_not_running_gives_nothing() {
  setup
  # Docker stopped: the make target that runs next fails with Docker's own error
  fake_docker 'Cannot connect to the Docker daemon' 1
  if [ -n "$(PATH="$tmp/bin:$PATH" sh "$SCRIPT" 2>/dev/null)" ] || ! PATH="$tmp/bin:$PATH" sh "$SCRIPT" 2>/dev/null; then
    fail "says nothing and does not fail when Docker cannot be asked"
  fi
  teardown
}

test_rootless_docker_gives_root
test_normal_docker_gives_nothing
test_docker_not_running_gives_nothing

if [ "$failures" -eq 0 ]; then
  echo "All tests passed"
else
  echo "$failures test(s) failed"
  exit 1
fi
