FROM node:22.19.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY bot/package.json bot/package.json
COPY frontend/package.json frontend/package.json
RUN npm install --workspace @techzakaz/backend --include-workspace-root=false
COPY backend backend
RUN npm run build --workspace @techzakaz/backend

FROM node:22.19.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY bot/package.json bot/package.json
COPY frontend/package.json frontend/package.json
RUN npm install --omit=dev --workspace @techzakaz/backend --include-workspace-root=false
COPY --from=build /app/backend/dist backend/dist
COPY backend/db backend/db
USER node
EXPOSE 3001
CMD ["sh", "-c", "node backend/dist/migrate.js && node backend/dist/seed.js && node backend/dist/server.js"]
