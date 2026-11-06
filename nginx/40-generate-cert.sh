#!/bin/sh
# Creates the self-signed certificate for https://localhost on first start,
# and again when it is missing or expires within 30 days. It only runs when the
# nginx container starts: a container left running for over a year keeps the old one.
# It lives in the certs volume: never in the repo or the image.
set -eu

CERT_DIR=/etc/nginx/certs
CERT="$CERT_DIR/cert.pem"
KEY="$CERT_DIR/key.pem"
# 30 days in seconds
RENEW_BEFORE=2592000

if [ -f "$CERT" ] && [ -f "$KEY" ] \
  && openssl x509 -checkend "$RENEW_BEFORE" -noout -in "$CERT" >/dev/null 2>&1; then
  echo "$0: certificate still valid, keeping it"
  exit 0
fi

echo "$0: creating a self-signed certificate for localhost (365 days)"
mkdir -p "$CERT_DIR"
# The private key is readable only by its owner from the moment it is written
umask 077
# Chrome only accepts the name from subjectAltName, not from CN
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost" \
  -keyout "$KEY.tmp" -out "$CERT.tmp" 2>/dev/null
# Written under a temporary name first: a failed run never leaves half a pair
mv "$KEY.tmp" "$KEY"
mv "$CERT.tmp" "$CERT"
# The certificate is public; the key stays 600
chmod 644 "$CERT"
