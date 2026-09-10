# Multi-stage Docker build for React Frontend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production web server using nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config for SPA routing and reverse proxy
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass https://multi-window-media-sequencer-production.up.railway.app/api/; \
        proxy_ssl_server_name on; \
        proxy_set_header Host multi-window-media-sequencer-production.up.railway.app; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
    location /ws { \
        proxy_pass https://multi-window-media-sequencer-production.up.railway.app/ws; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "Upgrade"; \
        proxy_ssl_server_name on; \
        proxy_set_header Host multi-window-media-sequencer-production.up.railway.app; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]