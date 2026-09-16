ARG SOURCE_DATE_EPOCH=1788130800
ARG PROXY_EXECUTABLE_SHA256=12f2c210ef4a60c4284888edbd34c4c9868a2cba5ce26a665ad875aaf980b6fb

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS build
WORKDIR /build
COPY --link containers/synthetic-sale/package.json containers/synthetic-sale/package-lock.json ./
RUN npm ci --ignore-scripts
COPY --link prisma.config.ts ./
COPY --link prisma/schema.prisma ./prisma/schema.prisma
RUN ./node_modules/.bin/prisma generate --config ./prisma.config.ts --schema ./prisma/schema.prisma \
  && npm prune --omit=dev

FROM gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861 AS proxy

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS proxy-verified
ARG PROXY_EXECUTABLE_SHA256
COPY --link --from=proxy /cloud-sql-proxy /verified/cloud-sql-proxy
RUN printf '%s  %s\n' "${PROXY_EXECUTABLE_SHA256}" /verified/cloud-sql-proxy | sha256sum --check --strict -

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS runtime
ARG SOURCE_DATE_EPOCH
ARG SOURCE_COMMIT
RUN test "$(printf '%s' "${SOURCE_COMMIT}" | wc -c)" = 40
LABEL org.opencontainers.image.created="${SOURCE_DATE_EPOCH}" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.title="mira-synthetic-sale" \
      mira.refund.contract="mira-refund-p3e-b2-synthetic-sale-service/v1"
WORKDIR /app
COPY --link --from=proxy-verified /verified/cloud-sql-proxy /usr/local/bin/cloud-sql-proxy
COPY --link --from=proxy /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --link --from=build /build/node_modules ./node_modules
COPY --link --from=build /build/package.json ./package.json
COPY --link dist/synthetic-sale-server.mjs ./server/synthetic-sale-server.mjs
COPY --link dist/synthetic-sale-client.js ./browser/synthetic-sale-client.js
COPY --link infra/refund-sandbox/p3e-b2/contracts/synthetic-sale-service-v1.json ./contracts/synthetic-sale-service-v1.json
RUN mkdir -p /cloudsql /tmp/synthetic-sale \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /opt/yarn* /root/.npm /root/.cache /var/lib/apt/lists/* /var/cache/apt/* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    /usr/bin/apt /usr/bin/apt-* /usr/bin/aptitude* /usr/bin/dpkg /usr/bin/dpkg-* \
    /usr/bin/curl /usr/bin/wget /bin/sh /bin/dash /bin/bash /usr/bin/sh /usr/bin/dash /usr/bin/bash \
  && chown -R 0:0 /app /usr/local/bin/cloud-sql-proxy \
  && chmod -R u=rwX,go=rX /app \
  && chmod 0755 /usr/local/bin/cloud-sql-proxy \
  && chown 65532:65532 /cloudsql /tmp/synthetic-sale \
  && chmod 0700 /cloudsql /tmp/synthetic-sale
ENV NODE_ENV=production
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/node", "/app/server/synthetic-sale-server.mjs"]
