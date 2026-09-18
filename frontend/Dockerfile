FROM node:22.19.0-alpine AS build
WORKDIR /app
ARG VITE_DEMO_AUTH=false
ARG VITE_API_BASE=/api
ENV VITE_DEMO_AUTH=$VITE_DEMO_AUTH
ENV VITE_API_BASE=$VITE_API_BASE
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY bot/package.json bot/package.json
COPY frontend/package.json frontend/package.json
RUN npm install --workspace @techzakaz/frontend --include-workspace-root=false
COPY frontend frontend
RUN npm run build --workspace @techzakaz/frontend

FROM nginx:1.27.2-alpine
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
