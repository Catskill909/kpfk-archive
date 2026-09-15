# KPFK Archive — single-stage, zero-dependency Node image.
FROM node:24-alpine

# Run as the unprivileged built-in "node" user.
WORKDIR /app

# Only source is needed; there are no dependencies to install. This is the
# complete runtime: server.js requires nothing outside lib/ and stations/.
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY stations ./stations
COPY public ./public

# The studio's HTML. Deliberately NOT under public/ — anything in that directory
# is served to anyone who asks, which would let /studio.html walk straight around
# the password gate. Only an authenticated route ever reads these.
COPY admin ./admin

# (No seed/: the KPFK app reads show descriptions from the Pacifica JSON catalog,
# so there is no warm-start file to ship. WBAI's image copied one.)

# Writable spot for everything the server persists (DATA_DIR, default /app/data).
#
# There is deliberately NO `VOLUME ["/app/data"]` here. That instruction sounds
# like it asks for persistence and does the opposite when no explicit mount is
# supplied: Docker then creates an *anonymous* volume, a new one per container,
# so data survives restarts and is thrown away on the next deploy — invisible in
# any UI (CLAUDE.md §4). Persistence comes from an explicit mount instead:
# Coolify → Storages → Volume Mount → /app/data. Verify with /healthz; do not
# assume. See docs/DEPLOYMENT.md.
RUN mkdir -p /app/data && chown node:node /app/data

ENV STATION_PROFILE=stations/kpfk.json
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node

# Lightweight healthcheck hitting the app's own endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "server.js"]
