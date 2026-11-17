#!/bin/sh
# Prints the user the make dev and make test containers must run as (#236):
# "root" when Docker runs rootless, nothing otherwise. Usage: sh scripts/container-user.sh
#
# Rootless Docker (the campus computers) maps the container's node user to an
# unrelated host user that cannot even enter the bind-mounted web folder
# (spawn sh EACCES), while the container's root is the person's own host user,
# with no extra power on the computer. With normal Docker, root is the real root,
# and the files the app writes in web (.next, src/generated) would then belong to
# root: so there it prints nothing and the compose files keep node.
# If Docker cannot be asked (stopped), it prints nothing: the make target that
# runs next fails with Docker's own error.
if docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q 'name=rootless'; then
  echo root
fi
