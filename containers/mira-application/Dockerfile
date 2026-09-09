FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN ./node_modules/.bin/prisma generate
# Synthetic import-time values are supplied outside the context and never copied.
# Existing next/font downloads happen during this build, never at server startup.
RUN --mount=type=secret,id=build-env,required=true \
    node -e 'const fs=require("node:fs"),cp=require("node:child_process"); const config=JSON.parse(fs.readFileSync("/run/secrets/build-env","utf8")); const result=cp.spawnSync("npm",["run","build"],{stdio:"inherit",env:{...process.env,...config}}); process.exit(result.status ?? 1)'

FROM node:22.23.1-bookworm-slim@sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27 AS runtime
WORKDIR /app
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.title="mira-application" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      mira.release-authority="absent"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1 \
    HOSTNAME=0.0.0.0 PORT=8080 MIRA_REFUND_AUTHORIZATION_ENABLED=DISABLED
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/content ./content
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p .next/cache && chown 65532:65532 .next/cache
USER 65532:65532
EXPOSE 8080
CMD ["node", "server.js"]
