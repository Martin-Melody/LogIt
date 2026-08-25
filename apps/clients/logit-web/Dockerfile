# Build context is the repo root (npm workspaces need packages/core alongside this app):
#   docker build -f apps/clients/logit-web/Dockerfile -t logit-web .
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/clients/logit-web/package.json apps/clients/logit-web/package.json
RUN npm ci

COPY packages/core packages/core
COPY apps/clients/logit-web apps/clients/logit-web
RUN npm run -w logit-web build

# adapter-node bundles the app and its dependencies into build/ — no node_modules
# needed at runtime, so the final image only needs the output directory.
FROM node:22-alpine AS final
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/clients/logit-web/build ./build

EXPOSE 3000
CMD ["node", "build/index.js"]
