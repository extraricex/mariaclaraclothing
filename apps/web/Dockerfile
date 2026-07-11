FROM node:22-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace apps/web --include-workspace-root=false

ARG VITE_FACEBOOK_META_PIXEL_ENABLED=false
ARG VITE_FACEBOOK_META_PIXEL_ID=595813035761213
ENV VITE_FACEBOOK_META_PIXEL_ENABLED=$VITE_FACEBOOK_META_PIXEL_ENABLED
ENV VITE_FACEBOOK_META_PIXEL_ID=$VITE_FACEBOOK_META_PIXEL_ID

COPY apps/web/index.html apps/web/vite.config.js ./apps/web/
COPY apps/web/src ./apps/web/src
WORKDIR /workspace/apps/web
RUN npm run build

FROM nginx:alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80
