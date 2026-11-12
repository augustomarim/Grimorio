# syntax=docker/dockerfile:1
FROM postgres:18-bookworm AS postgres-tools
RUN mkdir -p /pg-tools/bin /pg-tools/lib \
 && cp /usr/lib/postgresql/18/bin/pg_dump /usr/lib/postgresql/18/bin/pg_restore /pg-tools/bin/ \
 && ldd /pg-tools/bin/pg_dump /pg-tools/bin/pg_restore | awk '/=> \// {print $3}' | sort -u | xargs -I '{}' cp -L '{}' /pg-tools/lib/

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --include=dev --strict-ssl=true
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
ENV PATH="/opt/pg-tools/bin:${PATH}" LD_LIBRARY_PATH=/opt/pg-tools/lib
WORKDIR /app/backend
COPY --from=postgres-tools /pg-tools /opt/pg-tools
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --chown=node:node backend/package.json ./package.json
COPY --chown=node:node backend/migrations ./migrations
COPY --chown=node:node frontend/package.json frontend/publication.mjs frontend/validation.js frontend/rules.js frontend/mechanics.js frontend/spells.js frontend/glossary.js frontend/pt-BR.json frontend/reference.json /app/frontend/
RUN mkdir /backups && chown node:node /backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server.js"]
