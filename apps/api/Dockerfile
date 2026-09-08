# Build context must be the repo root (npm workspaces), e.g.:
#   docker build -f apps/api/Dockerfile -t mino-api .

FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci

COPY packages/shared-types packages/shared-types
RUN npm run build --workspace=@mino/shared-types

COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace=@mino/api

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci --omit=dev

COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
