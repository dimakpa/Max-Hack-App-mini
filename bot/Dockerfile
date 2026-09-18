FROM node:22.19.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY bot/package.json bot/package.json
COPY frontend/package.json frontend/package.json
RUN npm install --workspace @techzakaz/bot --include-workspace-root=false
COPY bot bot
RUN npm run build --workspace @techzakaz/bot

FROM node:22.19.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY bot/package.json bot/package.json
COPY frontend/package.json frontend/package.json
RUN npm install --omit=dev --workspace @techzakaz/bot --include-workspace-root=false
COPY --from=build /app/bot/dist bot/dist
USER node
EXPOSE 3002
CMD ["node", "bot/dist/server.js"]
