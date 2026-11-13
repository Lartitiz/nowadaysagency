FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
COPY assets ./assets
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
