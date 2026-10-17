# syntax=docker/dockerfile:1.7
# Production image: build the React frontend, then serve it from the API process.
FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src ./src
COPY shared ./shared
COPY public ./public

ARG VITE_API_BASE_URL=""
ARG VITE_FRONTEND_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_FRONTEND_URL=${VITE_FRONTEND_URL}

RUN npm run build

FROM node:22-bookworm-slim AS backend-dependencies

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production \
    PORT=5001 \
    DISABLE_AI_CHAT=true

WORKDIR /app/backend

COPY --from=backend-dependencies /app/backend/node_modules ./node_modules
COPY --chown=node:node backend ./
COPY --chown=node:node shared /app/shared
COPY --from=frontend-build --chown=node:node /app/dist ./public

RUN mkdir -p uploads public/payment && chown -R node:node /app

USER node

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const p=process.env.PORT||5001; require('http').get({host:'127.0.0.1',port:p,path:'/api/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "start"]
