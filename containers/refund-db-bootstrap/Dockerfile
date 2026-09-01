ARG SOURCE_DATE_EPOCH=1788130800
ARG PROXY_EXECUTABLE_SHA256=12f2c210ef4a60c4284888edbd34c4c9868a2cba5ce26a665ad875aaf980b6fb

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS build
WORKDIR /build
COPY --link containers/refund-db-bootstrap/package.json containers/refund-db-bootstrap/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY --link containers/refund-db-bootstrap/entrypoint.ts ./containers/refund-db-bootstrap/
COPY --link containers/refund-db-bootstrap/application-credentials.ts ./containers/refund-db-bootstrap/
COPY --link containers/refund-db-bootstrap/contacted-reconciliation-business-state-readback.ts ./containers/refund-db-bootstrap/
COPY --link scripts/eximbay-p3e-database-bootstrap.ts ./scripts/
COPY --link src/lib/payment/eximbay/checkout-recovery-state.ts ./src/lib/payment/eximbay/
COPY --link src/lib/payment/refund/eximbay-contacted-reconciliation-selection.ts ./src/lib/payment/refund/
COPY --link src/lib/payment/refund/worker-migration-inventory.ts ./src/lib/payment/refund/
COPY --link prisma.config.ts ./
COPY --link prisma ./prisma
COPY --link infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql ./infra/refund-sandbox/p3e-b2/runtime-deferred/
COPY --link infra/refund-sandbox/p3e-b2/eximbay-canary/database-role-grants.sql ./infra/refund-sandbox/p3e-b2/eximbay-canary/
COPY --link infra/refund-sandbox/p3e-b2/contacted-reconciliation/database-role-grants.sql ./infra/refund-sandbox/p3e-b2/contacted-reconciliation/
COPY --link infra/refund-sandbox/p3e-b2/business-state-readback/database-role-grants.sql ./infra/refund-sandbox/p3e-b2/business-state-readback/
COPY --link infra/refund-sandbox/p3e-b2/business-state-readback/database-role-revoke.sql ./infra/refund-sandbox/p3e-b2/business-state-readback/
COPY --link infra/refund-sandbox/p3e-b2/synthetic-sale/database-role-grants.sql ./infra/refund-sandbox/p3e-b2/synthetic-sale/
COPY --link infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v1.json ./infra/refund-sandbox/p3e-b2/contracts/
COPY --link infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json ./infra/refund-sandbox/p3e-b2/contracts/
COPY --link infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json ./infra/refund-sandbox/p3e-b2/eximbay-canary/
COPY --link infra/refund-sandbox/p3e-b2/eximbay-canary/main.tf ./infra/refund-sandbox/p3e-b2/eximbay-canary/
COPY --link infra/refund-sandbox/p3e-b2/eximbay-canary/locals.tf ./infra/refund-sandbox/p3e-b2/eximbay-canary/
COPY --link infra/refund-sandbox/p3e-b2/eximbay-canary/variables.tf ./infra/refund-sandbox/p3e-b2/eximbay-canary/
COPY --link dist/eximbay-refund-canary-target-producer.mjs ./dist/
RUN ./node_modules/.bin/prisma generate --config ./prisma.config.ts --schema ./prisma/schema.prisma \
  && ./node_modules/.bin/esbuild containers/refund-db-bootstrap/entrypoint.ts \
      --bundle --platform=node --target=node22 --format=esm --external:pg \
      --external:@prisma/client --external:@prisma/adapter-pg \
      --outfile=dist/refund-db-bootstrap-entrypoint.mjs \
  && ./node_modules/.bin/esbuild scripts/eximbay-p3e-database-bootstrap.ts \
      --bundle --platform=node --target=node22 --format=esm --external:pg \
      --outfile=dist/eximbay-p3e-database-bootstrap.mjs \
  && npm prune --omit=dev

FROM gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861 AS proxy

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS proxy-verified
ARG PROXY_EXECUTABLE_SHA256
COPY --link --from=proxy /cloud-sql-proxy /verified/cloud-sql-proxy
RUN printf '%s  %s\n' "${PROXY_EXECUTABLE_SHA256}" /verified/cloud-sql-proxy \
  | sha256sum --check --strict -

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS runtime
ARG SOURCE_DATE_EPOCH
ARG SOURCE_COMMIT
RUN test "$(printf '%s' "${SOURCE_COMMIT}" | wc -c)" = 40 \
  && printf '%s\n' "${SOURCE_COMMIT}" > /bootstrap-source-commit
LABEL org.opencontainers.image.created="${SOURCE_DATE_EPOCH}" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.title="mira-refund-db-bootstrap" \
      mira.refund.contract="mira-refund-p3e-b2-db-bootstrap-runtime/v1" \
      mira.refund.default-mode="check"
WORKDIR /app
COPY --link --from=proxy-verified /verified/cloud-sql-proxy /usr/local/bin/cloud-sql-proxy
COPY --link --from=proxy /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --link --from=build /build/dist ./scripts
COPY --link --from=build /build/node_modules ./node_modules
COPY --link --from=build /build/package.json ./package.json
COPY --link --from=build /build/prisma.config.ts ./prisma.config.ts
COPY --link --from=build /build/prisma ./prisma
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql ./infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/eximbay-canary/database-role-grants.sql ./infra/refund-sandbox/p3e-b2/eximbay-canary/database-role-grants.sql
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/contacted-reconciliation/database-role-grants.sql ./infra/refund-sandbox/p3e-b2/contacted-reconciliation/database-role-grants.sql
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/business-state-readback/database-role-grants.sql ./infra/refund-sandbox/p3e-b2/business-state-readback/database-role-grants.sql
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/business-state-readback/database-role-revoke.sql ./infra/refund-sandbox/p3e-b2/business-state-readback/database-role-revoke.sql
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/synthetic-sale/database-role-grants.sql ./infra/refund-sandbox/p3e-b2/synthetic-sale/database-role-grants.sql
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/contracts ./infra/refund-sandbox/p3e-b2/contracts
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json ./infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/eximbay-canary/main.tf ./infra/refund-sandbox/p3e-b2/eximbay-canary/main.tf
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/eximbay-canary/locals.tf ./infra/refund-sandbox/p3e-b2/eximbay-canary/locals.tf
COPY --link --from=build /build/infra/refund-sandbox/p3e-b2/eximbay-canary/variables.tf ./infra/refund-sandbox/p3e-b2/eximbay-canary/variables.tf
RUN mkdir -p /cloudsql /tmp/refund-db-bootstrap \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /opt/yarn* /root/.npm /root/.cache /var/lib/apt/lists/* /var/cache/apt/* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    /usr/bin/apt /usr/bin/apt-* /usr/bin/aptitude* /usr/bin/dpkg /usr/bin/dpkg-* \
    /usr/bin/curl /usr/bin/wget /bin/sh /bin/dash /bin/bash /usr/bin/sh /usr/bin/dash /usr/bin/bash \
  && chown -R 0:0 /app /bootstrap-source-commit /usr/local/bin/cloud-sql-proxy \
  && chmod -R u=rwX,go=rX /app \
  && chmod 0444 /bootstrap-source-commit \
  && chmod 0755 /usr/local/bin/cloud-sql-proxy \
  && chown 65532:65532 /cloudsql /tmp/refund-db-bootstrap \
  && chmod 0700 /cloudsql /tmp/refund-db-bootstrap
ENV NODE_ENV=production
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/node", "/app/scripts/refund-db-bootstrap-entrypoint.mjs"]
CMD ["check"]
