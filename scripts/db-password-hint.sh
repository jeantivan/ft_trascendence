#!/bin/sh
# Explains a failed start to the person running make. Reads the migrate logs from stdin.
# Postgres only reads its password when it creates its data, so a new .env (random
# password) does not match data created with an older one. Prisma reports that as P1000.
# It only explains: it never deletes or changes anything.
if grep -q P1000; then
  # Yellow only in a terminal: a log file would get the raw color codes
  yellow='' reset=''
  if [ -t 2 ]; then
    yellow=$(printf '\033[1;33m')
    reset=$(printf '\033[0m')
  fi
  cat >&2 <<MESSAGE

${yellow}WARNING:${reset} PostgreSQL rejected the user or password in .env. Its data was probably created with a different password.
Keep the data: if you still have the old password, put it in POSTGRES_PASSWORD in .env.
Start from scratch: make fclean, then make (deletes ALL the local database data).

MESSAGE
fi
