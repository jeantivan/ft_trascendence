#!/bin/sh
# Prints the address other computers on the network use to reach this one (#211),
# or nothing if it cannot tell. Usage: sh scripts/host-ip.sh
#
# A computer has several addresses: on a campus computer, the campus network one
# (10.13.x.x) plus the virtual machines (192.168.122.1) and Docker (172.17.0.1)
# ones, in no guaranteed order. The good one is the address the computer goes
# out by: "ip route get" asks which way a packet to 1.1.1.1 would take and prints
# that address after "src". It only asks the routing table: nothing is sent.
#
# Nothing on WSL: its address belongs to the Linux inside Windows, and other
# computers cannot reach it. Nothing either without network or without the ip
# command (macOS): make then prints the placeholder instead.
case "$(uname -r 2>/dev/null)" in
  *[Mm]icrosoft*) exit 0 ;;
esac
command -v ip >/dev/null 2>&1 || exit 0
ip route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | sed -n 1p
exit 0
