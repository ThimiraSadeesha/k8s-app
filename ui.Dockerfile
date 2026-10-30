FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY apps/ui/package*.json ./
RUN npm ci

COPY apps/ui/ ./

# Next.js bakes rewrites in at build time, so the API origin must be known here.
ARG API_URL=http://api:8000
ENV API_URL=${API_URL}
ENV NODE_ENV=production

RUN npm run build

FROM node:20-bookworm-slim AS prod

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]
