FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    IP=0.0.0.0

COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node app.js sockets.js words.json word-aliases.json ./
COPY --chown=node:node bin ./bin
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node public ./public
COPY --chown=node:node views ./views

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "./bin/www"]
