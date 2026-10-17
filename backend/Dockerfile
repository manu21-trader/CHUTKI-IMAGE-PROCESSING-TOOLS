# syntax=docker/dockerfile:1.7
# Backend-only image. Build from the repository root:
# docker build -f backend/Dockerfile -t chutki-backend .
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=5001 \
    DISABLE_AI_CHAT=true

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev

COPY --chown=node:node backend ./
COPY --chown=node:node shared /app/shared

RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const p=process.env.PORT||5001; require('http').get({host:'127.0.0.1',port:p,path:'/api/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "start"]
