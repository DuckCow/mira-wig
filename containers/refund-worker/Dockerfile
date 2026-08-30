ARG SOURCE_DATE_EPOCH=1784764800
ARG PROXY_EXECUTABLE_SHA256=12f2c210ef4a60c4284888edbd34c4c9868a2cba5ce26a665ad875aaf980b6fb

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS build
WORKDIR /build
COPY --link package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY --link tsconfig.json prisma.config.ts ./
COPY --link prisma ./prisma
COPY --link scripts/refund-execution-worker.ts scripts/refund-sandbox-provider-free-preflight.ts scripts/eximbay-refund-canary.ts scripts/prepare-eximbay-refund-canary-admission.ts ./scripts/
COPY --link scripts/build-refund-worker-bundles.mts ./scripts/
COPY --link containers/refund-worker/entrypoint.ts ./containers/refund-worker/
COPY --link src/lib/payment ./src/lib/payment
COPY --link src/lib/promotion ./src/lib/promotion
COPY --link src/lib/market/locale.ts src/lib/market/types.ts ./src/lib/market/
RUN ./node_modules/.bin/prisma generate
RUN node --import tsx scripts/build-refund-worker-bundles.mts

FROM gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861 AS proxy

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS proxy-verified
ARG PROXY_EXECUTABLE_SHA256
COPY --link --from=proxy /cloud-sql-proxy /verified/cloud-sql-proxy
RUN printf '%s  %s\n' "${PROXY_EXECUTABLE_SHA256}" /verified/cloud-sql-proxy \
  | sha256sum --check --strict -

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS runtime
ARG SOURCE_DATE_EPOCH
LABEL org.opencontainers.image.created="${SOURCE_DATE_EPOCH}" \
      org.opencontainers.image.title="mira-refund-worker" \
      org.opencontainers.image.version="local-reproducibility-proof" \
      mira.refund.contract="mira-refund-worker-runtime-image-connection/v1" \
      mira.refund.release-authority="absent"
WORKDIR /app
COPY --link --from=proxy-verified /verified/cloud-sql-proxy /usr/local/bin/cloud-sql-proxy
COPY --link --from=build /build/.refund-worker-build/src ./src
COPY --link --from=build /build/prisma/migrations ./prisma/migrations
COPY --link --from=build /build/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --link --from=build /build/node_modules/@prisma/client-runtime-utils ./node_modules/@prisma/client-runtime-utils
COPY --link --from=build /build/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /cloudsql /tmp/refund-worker \
  && rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /opt/yarn* \
    /root/.npm \
    /root/.cache \
    /var/lib/apt/lists/* \
    /var/cache/apt/* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && rm -f /usr/bin/apt /usr/bin/apt-* /usr/bin/aptitude* \
    /usr/bin/dpkg /usr/bin/dpkg-* \
    /usr/bin/deb-systemd-helper /usr/bin/deb-systemd-invoke \
    /usr/bin/update-alternatives /usr/bin/gpgv \
    /usr/bin/gcc /usr/bin/g++ /usr/bin/cc /usr/bin/c++ \
    /usr/bin/make /usr/bin/ld /usr/bin/as /usr/bin/ar \
    /usr/bin/curl /usr/bin/wget \
    /usr/bin/rbash \
    /etc/cron.daily/apt-compat /etc/cron.daily/dpkg \
  && rm -rf /usr/lib/apt /usr/lib/dpkg /usr/libexec/dpkg \
    /usr/sbin/dpkg-* \
    /usr/share/bug/dpkg \
    /etc/systemd/system/timers.target.wants/apt-* \
    /etc/systemd/system/timers.target.wants/dpkg-* \
    /usr/lib/systemd/system/apt-* \
    /usr/lib/systemd/system/dpkg-* \
  && find /app/node_modules -type f \( -name '*.d.ts' -o -name '*.d.mts' -o -name '*.map' \) -delete \
  && rm -f /bin/sh /bin/dash /bin/bash /usr/bin/sh /usr/bin/dash /usr/bin/bash \
  && rm -rf /root/.cache \
  && chown -R 0:0 /app \
  && chmod -R u=rwX,go=rX /app \
  && chown 0:0 / /usr /usr/local /usr/local/bin /etc /tmp /var/tmp /run/lock \
  && chown -h 0:0 /usr/local/bin/node \
  && chown 0:0 /usr/local/bin/cloud-sql-proxy \
  && chmod 0755 / /usr /usr/local /usr/local/bin /etc /tmp /var/tmp /run/lock \
    /usr/local/bin/node /usr/local/bin/cloud-sql-proxy \
  && chown 65532:65532 /cloudsql /tmp/refund-worker \
  && chmod 0700 /cloudsql /tmp/refund-worker
ENV NODE_ENV=production
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/node", "/app/src/lib/payment/refund/refund-worker-container-entrypoint.mjs"]
CMD []
