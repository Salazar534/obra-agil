FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY public ./public
COPY site ./site
COPY scripts/docker-entry.mjs scripts/serve-web.mjs ./scripts/

ENV NODE_OPTIONS=--experimental-strip-types
EXPOSE 3001
CMD ["node", "scripts/docker-entry.mjs"]
