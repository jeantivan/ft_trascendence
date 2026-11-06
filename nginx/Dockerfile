# NGINX: the only entry point to the app, HTTPS on 8443 (issue #59)
FROM nginx:1.30.6-alpine

# The official image has no openssl CLI: needed to create the self-signed certificate
RUN apk add --no-cache openssl

# The official entrypoint runs /docker-entrypoint.d/*.sh before starting nginx
COPY --chmod=755 40-generate-cert.sh /docker-entrypoint.d/40-generate-cert.sh

# Our site: HTTPS on 8443, forwarded to app:3000
COPY app.conf /etc/nginx/conf.d/default.conf
