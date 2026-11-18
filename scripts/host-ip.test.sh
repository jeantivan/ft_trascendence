#!/bin/sh
# Tests for host-ip.sh. Usage: sh scripts/host-ip.test.sh
# Each test puts a fake ip and a fake uname first in PATH, so the real network
# settings of the computer running the tests never decide the result.

SCRIPT="$(cd "$(dirname "$0")" && pwd)/host-ip.sh"
SH=$(command -v sh)
failures=0

setup() {
  tmp=$(mktemp -d)
  mkdir "$tmp/bin"
  # The only other program the script may use; a PATH without it is "no ip installed"
  ln -s "$(command -v sed)" "$tmp/bin/sed"
}

teardown() {
  rm -rf "$tmp"
}

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

# Fake ip: only "ip route get 1.1.1.1" prints $1 and exits with $2; any other
# command fails, so a typo in the script's ip command makes the tests fail
fake_ip() {
  printf '#!/bin/sh\n[ "$*" = "route get 1.1.1.1" ] || { echo "fake ip: unexpected $*" >&2; exit 2; }\nprintf "%%b" "%s"\nexit %s\n' "$1" "$2" > "$tmp/bin/ip"
  chmod +x "$tmp/bin/ip"
}

# Fake uname: "uname -r" prints the kernel release $1
fake_uname() {
  printf '#!/bin/sh\n[ "$1" = -r ] || exit 2\necho "%s"\n' "$1" > "$tmp/bin/uname"
  chmod +x "$tmp/bin/uname"
}

run() {
  PATH="$tmp/bin" "$SH" "$SCRIPT" 2>/dev/null
}

test_campus_gives_its_address() {
  setup
  # What a campus computer has (#211): the campus network address is the way out,
  # not the virtual machines (192.168.122.1) or Docker (172.17.0.1) ones
  fake_uname '6.8.0-48-generic'
  fake_ip '1.1.1.1 via 10.13.254.254 dev enp4s0f0 src 10.13.13.1 uid 101234 \n    cache \n' 0
  if [ "$(run)" != "10.13.13.1" ]; then
    fail "gives the address the computer goes out by"
  fi
  teardown
}

test_direct_network_gives_its_address() {
  setup
  # The way out is on the same network as the computer: the answer has no "via"
  fake_uname '6.8.0-48-generic'
  fake_ip '1.1.1.1 dev enp4s0f0 src 10.13.13.1 uid 101234 \n    cache \n' 0
  if [ "$(run)" != "10.13.13.1" ]; then
    fail "gives the address when the answer has no via"
  fi
  teardown
}

test_wsl_gives_nothing() {
  setup
  # WSL's address belongs to its Linux inside Windows: other computers cannot reach it
  fake_uname '6.18.58.1-microsoft-standard-WSL2'
  fake_ip '1.1.1.1 via 172.25.144.1 dev eth0 src 172.25.147.242 uid 1000 \n    cache \n' 0
  if [ -n "$(run)" ]; then
    fail "gives nothing on WSL"
  fi
  teardown
}

test_no_network_gives_nothing() {
  setup
  # No way out: ip prints the error on stderr and fails
  fake_uname '6.8.0-48-generic'
  printf '#!/bin/sh\necho "RTNETLINK answers: Network is unreachable" >&2\nexit 2\n' > "$tmp/bin/ip"
  chmod +x "$tmp/bin/ip"
  if [ -n "$(run)" ] || ! run >/dev/null; then
    fail "gives nothing and does not fail without network"
  fi
  teardown
}

test_answer_without_src_gives_nothing() {
  setup
  fake_uname '6.8.0-48-generic'
  fake_ip 'local 1.1.1.1 dev lo table local \n' 0
  if [ -n "$(run)" ]; then
    fail "gives nothing when the answer has no src"
  fi
  teardown
}

test_without_ip_gives_nothing() {
  setup
  # Some computers (macOS) have no ip command
  fake_uname '23.6.0'
  if [ -n "$(run)" ] || ! run >/dev/null; then
    fail "gives nothing and does not fail without the ip command"
  fi
  teardown
}

test_campus_gives_its_address
test_direct_network_gives_its_address
test_wsl_gives_nothing
test_no_network_gives_nothing
test_answer_without_src_gives_nothing
test_without_ip_gives_nothing

if [ "$failures" -eq 0 ]; then
  echo "All tests passed"
else
  echo "$failures test(s) failed"
  exit 1
fi
