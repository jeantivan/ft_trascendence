#!/bin/sh
# Checks that nginx is the only way in, over HTTPS (issue #59), keeps the
# visitor's address (#60) and carries the real-time stream (#61).
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

# 5. No plain HTTP on the HTTPS port: nginx itself refuses it with 400
# ("plain HTTP request was sent to HTTPS port"). Any other code (000, 301, 404)
# means something else answered or nothing did
code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://localhost:$port/login")
if [ "$code" = "400" ]; then pass "plain HTTP refused by nginx (400) on port $port"; else fail "plain HTTP on port $port answered $code, expected 400"; fi

# 6. Only nginx publishes ports: the app is reachable only inside Docker
# docker port lists the published ports of the app container: none expected
app_id=$(docker compose ps -q app)
published=$(docker port "$app_id" 2>/dev/null | tr "\n" " ")
if [ -z "$app_id" ]; then
  fail "app container not found, cannot check its ports"
elif [ -n "$published" ]; then
  fail "app publishes ports ($published): only nginx may publish ports"
else
  pass "app publishes no ports"
fi

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

# 12. HTTP/2 to the browser (#61): with HTTP/1.1 the browser opens at most 6
# connections per address, and every tab keeps one busy with /api/events
version=$(curl_https -o /dev/null -w '%{http_version}' --http2 "$url/login")
if [ "$version" = "2" ]; then pass "HTTP/2 offered"; else fail "HTTP version is '$version', expected 2"; fi

# 13. The real-time stream has its own location in nginx (#61): it must still reach
# the app. Without a session the app answers 401 (nginx alone would not)
code=$(curl_https -o /dev/null -w '%{http_code}' "$url/api/events")
if [ "$code" = "401" ]; then pass "/api/events reaches the app (401 without a session)"; else fail "/api/events answered $code, expected 401"; fi

# 14. nginx looks up the app's address on each request, not once at start (#61).
# Otherwise a recreated app container on a new IP gives 502 until nginx restarts.
# Reads the loaded config: a resolver, and no proxy_pass to the app with a fixed
# address (other services, such as Mailpit, may keep one).
# Comment lines are dropped first, so a commented-out directive does not count.
config=$(docker compose exec -T nginx nginx -T 2>/dev/null | grep -v '^[[:space:]]*#')
if [ -z "$config" ]; then
  fail "could not read the nginx config (docker compose exec nginx nginx -T)"
elif ! printf '%s\n' "$config" | grep -q 'resolver 127\.0\.0\.11'; then
  fail "no resolver 127.0.0.11 in the nginx config"
elif printf '%s\n' "$config" | grep -Eq 'proxy_pass[[:space:]]+https?://app[:/;]'; then
  fail "a proxy_pass to the app has a fixed address: use \$app_upstream"
else
  pass "app address looked up on each request (resolver + \$app_upstream)"
fi

if [ "$failures" -eq 0 ]; then
  echo "All nginx checks passed"
else
  echo "$failures nginx check(s) failed"
  exit 1
fi
