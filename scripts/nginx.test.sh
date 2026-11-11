#!/bin/sh
# Checks that nginx is the only way in, over HTTPS (issue #59), keeps the
# visitor's address (#60), guards the test mail inbox (#93) and carries the
# real-time stream (#61), and keeps tokens in links out of its logs and the app's (#185).
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

# make dev is detected by the app's image name (image: transcendence-app-dev in
# docker-compose.dev.yml): if that name changes, update this line. Used by checks 10 and 19.
# Read from the container, not from docker compose ps: make test builds an image with
# the same name, and then ps can show the running container's image as a bare sha256
is_dev=false
app_container=$(docker compose ps -q app 2>/dev/null)
if [ -n "$app_container" ] &&
  docker inspect -f '{{.Config.Image}}' "$app_container" 2>/dev/null | grep -q -- '-dev$'; then
  is_dev=true
fi

# The last minute of a service's log: enough for one check's requests, and quick
# after a long make dev
service_logs() {
  docker compose logs --no-log-prefix --since 60s "$1" 2>&1
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

# 10. make dev only: the hot reload WebSocket goes through nginx
if [ "$is_dev" = true ]; then
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

# 14. HTTP/2 to the browser (#61): with HTTP/1.1 the browser opens at most 6
# connections per address, and every tab keeps one busy with /api/events
version=$(curl_https -o /dev/null -w '%{http_version}' --http2 "$url/login")
if [ "$version" = "2" ]; then pass "HTTP/2 offered"; else fail "HTTP version is '$version', expected 2"; fi

# 15. The real-time stream has its own location in nginx (#61): it must still reach
# the app. Without a session the app answers 401 (nginx alone would not)
code=$(curl_https -o /dev/null -w '%{http_code}' "$url/api/events")
if [ "$code" = "401" ]; then pass "/api/events reaches the app (401 without a session)"; else fail "/api/events answered $code, expected 401"; fi

# 16. nginx looks up the app's address on each request, not once at start (#61).
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

# 17-18. Tokens in links stay out of nginx's logs (#185): the data export (#165)
# sends its download token after "?". The secret is new on each run, so an older
# run cannot hide or fake a result. Each check also needs the request's own log
# line: if the logs could not be read, "secret not found" would prove nothing.
run_id="$(date +%s)-$$"
secret="secret-$run_id"

# 17. The access log keeps the path, without what comes after "?", in the request
# and in the Referer (the page the browser came from).
# The path is new on each run too (the app answers 404), so the line found is this one
path="/log-check-$run_id"
curl_https -o /dev/null -e "$url/page?token=$secret-referer" "$url$path?token=$secret"
sleep 1
logs=$(service_logs nginx)
if ! printf '%s\n' "$logs" | grep -q "\"GET $path[ ?]"; then
  fail "the request to $path is not in the nginx logs: cannot check the token"
elif printf '%s\n' "$logs" | grep -q "$secret"; then
  fail "the access log keeps what comes after '?' (token visible)"
else
  pass "access log keeps the path and the Referer without what comes after '?'"
fi

# 18. The error log copies the whole request, "?" part included, and its format
# cannot change. On the download route (#165) it only keeps critical errors.
# A body over 5 MB makes nginx write an error line (413), without touching the app.
# An address over 8 KB (414) is rejected before nginx knows the route: its error line
# is "info", below the log level, so it only shows if someone lowers that level
download="/api/gdpr/export/check-$run_id/download"
head -c 6000000 /dev/zero | curl_https -o /dev/null -X POST --data-binary @- \
  -H 'Content-Type: application/octet-stream' "$url$download?token=$secret-download"
# The same with a slash at the end: nginx would otherwise skip the download block
head -c 6000000 /dev/zero | curl_https -o /dev/null -X POST --data-binary @- \
  -H 'Content-Type: application/octet-stream' "$url$download/?token=$secret-download"
long=$(head -c 9000 /dev/zero | tr '\0' a)
long_code=$(curl_https --http1.1 -o /dev/null -w '%{http_code}' "$url$download?token=$secret-download&pad=$long")
sleep 1
logs=$(service_logs nginx)
if ! printf '%s\n' "$logs" | grep -q "\"POST $download[ ?]"; then
  fail "the request to $download is not in the nginx logs: cannot check the token"
elif ! printf '%s\n' "$logs" | grep -q "\"POST $download/[ ?]"; then
  fail "the request to $download/ is not in the nginx logs: cannot check the token"
elif [ "$long_code" != "414" ]; then
  fail "an address over 8 KB answered $long_code, expected 414: cannot check the token"
elif printf '%s\n' "$logs" | grep -q "$secret-download"; then
  fail "a log of the download route keeps the token (access or error log)"
else
  pass "download route: no log keeps the token, not even on an error"
fi

# 19. The app's own log keeps no token either: next start logs no requests, and next
# dev leaves out links with a token parameter (web/next.config.ts).
# The logs must be readable first. make dev: a request without a token must show.
# make: next start logs no requests, so its start-up lines must show (whole log)
curl_https -o /dev/null "$url/login?token=$secret-app"
[ "$is_dev" = true ] && curl_https -o /dev/null "$url/login?check=$run_id-app-shown"
sleep 1
app_logs=$(service_logs app)
if [ "$is_dev" = true ] && ! printf '%s\n' "$app_logs" | grep -q "$run_id-app-shown"; then
  fail "the request without a token is not in the app logs: cannot check the token"
elif [ "$is_dev" = false ] && [ -z "$(docker compose logs --no-log-prefix app 2>&1)" ]; then
  fail "the app log is empty: cannot check the token"
elif printf '%s\n' "$app_logs" | grep -q "$secret-app"; then
  fail "the app log keeps a link's token"
else
  pass "the app log keeps no link token"
fi

# 20. The Referer carries only the origin, never the path or the "?" part (#185):
# why, in nginx/app.conf. Exactly one Referrer-Policy: strict-origin on the app's
# pages, on the test mail inbox (which sends its own) and on nginx's own error pages
# (413), which only get the header with "always"
policy_of() {
  printf '%s\n' "$1" | tr -d '\r' | grep -i '^referrer-policy:' | sed 's/^[^:]*:[[:space:]]*//'
}
page_policy=$(policy_of "$(curl_https -o /dev/null -D - "$url/login")")
mailpit_policy=$(policy_of "$(curl_https -o /dev/null -D - "$url/mailpit/")")
# 6000000 bytes: over client_max_body_size (5 MB), so nginx answers 413 itself
error_policy=$(policy_of "$(head -c 6000000 /dev/zero | curl_https -o /dev/null -D - -X POST \
  --data-binary @- -H 'Content-Type: application/octet-stream' "$url/login")")
if [ "$page_policy" != "strict-origin" ]; then
  fail "a page sends Referrer-Policy '$page_policy', expected exactly one 'strict-origin'"
elif [ "$mailpit_policy" != "strict-origin" ]; then
  fail "the mail inbox sends Referrer-Policy '$mailpit_policy', expected exactly one 'strict-origin'"
elif [ "$error_policy" != "strict-origin" ]; then
  fail "an nginx error page (413) sends Referrer-Policy '$error_policy', expected exactly one 'strict-origin'"
else
  pass "Referrer-Policy strict-origin: the Referer carries no path or token"
fi

if [ "$failures" -eq 0 ]; then
  echo "All nginx checks passed"
else
  echo "$failures nginx check(s) failed"
  exit 1
fi
