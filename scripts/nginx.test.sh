#!/bin/sh
# Checks that nginx is the only way in, over HTTPS (issue #59).
# Usage: make test-nginx, with the app running (make or make dev).
# Reads nothing from .env: the port comes from Docker.

cd "$(dirname "$0")/.." || exit 1
# No set -e on purpose: every check runs and the failures are counted at the end
failures=0

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

pass() {
  echo "ok: $1"
}

# Host port published for nginx, e.g. 0.0.0.0:8443 → 8443
port=$(docker compose port nginx 8443 2>/dev/null | head -n 1 | sed 's/.*://')
if [ -z "$port" ]; then
  echo "FAIL: nginx is not running. Start the app first (make or make dev)."
  exit 1
fi
url="https://localhost:$port"
# -k: the certificate is self-signed, so curl cannot verify who signed it
curl_https() {
  curl -sk -m 10 "$@"
}

# Right after make the app may still be starting (nginx answers 502): wait up to
# about 2 minutes (30 tries, each at most 2 s for curl plus 2 s of pause)
tries=0
while [ "$tries" -lt 30 ]; do
  code=$(curl -sk -m 2 -o /dev/null -w '%{http_code}' "$url/login")
  [ "$code" = "200" ] && break
  tries=$((tries + 1))
  sleep 2
done

# 1. The app answers through nginx
if [ "$code" = "200" ]; then pass "$url/login answers 200"; else fail "$url/login answers $code, expected 200"; fi

# 2. TLS 1.3 works
if curl_https -o /dev/null --tlsv1.3 "$url/login"; then pass "TLS 1.3 accepted"; else fail "TLS 1.3 refused"; fi

# 3. Older versions are refused
# curl exit code 35 = TLS handshake failed; any other code is a different problem
curl_https -o /dev/null --tls-max 1.2 "$url/login"
status=$?
if [ "$status" -eq 35 ]; then
  pass "TLS 1.2 refused"
elif [ "$status" -eq 0 ]; then
  fail "TLS 1.2 accepted, only 1.3 should be"
else
  fail "TLS 1.2 check could not run (curl exit code $status)"
fi

# 4. The nginx version is hidden
server=$(curl_https -I "$url/login" | tr -d '\r' | sed -n 's/^[Ss]erver: //p')
if [ "$server" = "nginx" ]; then pass "Server header without version"; else fail "Server header is '$server', expected 'nginx'"; fi

# 5. No plain HTTP on the HTTPS port
code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://localhost:$port/login")
if [ "$code" = "200" ]; then fail "plain HTTP answers 200 on port $port"; else pass "plain HTTP not served on port $port"; fi

# 6. Only nginx publishes ports: the other services are reachable only inside Docker
# docker port lists the published ports of a container: none expected
for service in app mailpit; do
  container_id=$(docker compose ps -q "$service")
  published=$(docker port "$container_id" 2>/dev/null | tr "\n" " ")
  if [ -z "$container_id" ]; then
    fail "$service container not found, cannot check its ports"
  elif [ -n "$published" ]; then
    fail "$service publishes ports ($published): only nginx may publish ports"
  else
    pass "$service publishes no ports"
  fi
done

# 7. Body size limit: 5 MB (profile photos, #23)
# The path does not exist on purpose: nginx checks the size before forwarding,
# so only nginx can answer 413 here; the app answers anything else (e.g. 401, 404)
post_size() {
  head -c "$1" /dev/zero | curl_https -o /dev/null -w '%{http_code}' \
    -X POST --data-binary @- -H 'Content-Type: application/octet-stream' "$url/api/body-size-check"
}
code=$(post_size 4000000)
if [ "$code" = "413" ]; then
  fail "4 MB body rejected with 413"
elif [ "$code" = "000" ]; then
  fail "4 MB body: no answer"
else
  pass "4 MB body accepted by nginx (app answered $code)"
fi
code=$(post_size 6000000)
if [ "$code" = "413" ]; then pass "6 MB body rejected with 413"; else fail "6 MB body answered $code, expected 413"; fi

# 8. The certificate is for localhost and not about to expire.
# 2592000 s = 30 days, the same window as RENEW_BEFORE in nginx/40-generate-cert.sh
if docker compose exec -T nginx sh -c \
  'openssl x509 -in /etc/nginx/certs/cert.pem -noout -ext subjectAltName | grep -q "DNS:localhost" &&
   openssl x509 -in /etc/nginx/certs/cert.pem -noout -checkend 2592000 >/dev/null'; then
  pass "certificate for localhost, valid for more than 30 days"
else
  fail "certificate missing, without localhost, or expiring within 30 days"
fi

# 9. No certificate or key in the repo
tracked=$(git ls-files | grep -E '\.(pem|key|crt)$')
if [ -z "$tracked" ]; then pass "no certificates or keys in git"; else fail "certificates or keys in git: $tracked"; fi

# 10. make dev only: the hot reload WebSocket goes through nginx.
# make dev is detected by the image name (image: transcendence-app-dev in
# docker-compose.dev.yml): if that name changes, update this check
if docker compose ps app --format '{{.Image}}' | grep -q -- '-dev$'; then
  # Next 16 serves hot reload on /_next/hmr. Once upgraded the connection stays
  # open, so curl stops after 3 s: only the 101 status matters
  code=$(curl -sk -m 3 -o /dev/null -w '%{http_code}' --http1.1 \
    -H "Origin: $url" -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    "$url/_next/hmr")
  if [ "$code" = "101" ]; then pass "WebSocket upgrade reaches next dev (101)"; else fail "WebSocket upgrade answered $code, expected 101"; fi
fi

# 11. Redirects use the address the visitor used, whichever it is (#60): the app can
# be opened from another computer. 10.11.1.5 is made up: only the Host header matters.
for host in "localhost:$port" "10.11.1.5:$port"; do
  expected="https://$host/login?callbackUrl=%2Fdashboard"
  location=$(curl_https -o /dev/null -D - -H "Host: $host" "$url/dashboard" | tr -d '\r' | sed -n 's/^[Ll]ocation: //p')
  if [ "$location" = "$expected" ]; then
    pass "redirect to /login keeps $host"
  else
    fail "redirect through $host goes to '$location', expected '$expected'"
  fi
done

# 12. The test mail inbox (#93) needs its password: the mail carries one-time codes.
# The credentials come from the container, so this still reads nothing from .env.
code=$(curl_https -o /dev/null -w '%{http_code}' "$url/mailpit/")
if [ "$code" = "401" ]; then pass "mail inbox refuses a visitor without the password (401)"; else fail "mail inbox without the password answers $code, expected 401"; fi
credentials=$(docker compose exec -T mailpit printenv MP_UI_AUTH 2>/dev/null)
# Empty credentials must not reach curl: -u "" would wait for a password forever
if [ -z "$credentials" ]; then
  fail "mailpit has no MP_UI_AUTH: the inbox has no password"
else
  code=$(curl_https -o /dev/null -w '%{http_code}' -u "$credentials" "$url/mailpit/")
  if [ "$code" = "200" ]; then pass "mail inbox opens with the password"; else fail "mail inbox with the password answers $code, expected 200"; fi
fi

# 13. /mailpit redirects without naming a port: only the path, so it works whichever
# host port or address the visitor used
location=$(curl_https -o /dev/null -D - "$url/mailpit" | tr -d '\r' | sed -n 's/^[Ll]ocation: //p')
if [ "$location" = "/mailpit/" ]; then pass "/mailpit redirects to /mailpit/"; else fail "/mailpit redirects to '$location', expected '/mailpit/'"; fi

if [ "$failures" -eq 0 ]; then
  echo "All nginx checks passed"
else
  echo "$failures nginx check(s) failed"
  exit 1
fi
