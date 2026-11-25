FROM node:24.22.1-bookworm-slim AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY deploy/static/precompress.mjs /tmp/precompress.mjs
ARG SCAR_CDN_URL=
RUN if [ -n "$SCAR_CDN_URL" ]; then \
      ./node_modules/.bin/ng build --configuration production --deploy-url "$SCAR_CDN_URL"; \
    else \
      ./node_modules/.bin/ng build --configuration production; \
    fi \
    && node /tmp/precompress.mjs dist/scar-front/browser

FROM caddy:2.11.9-alpine
COPY deploy/edge/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist/scar-front/browser/ /srv/
