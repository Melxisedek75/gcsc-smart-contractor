FROM node:20-alpine

WORKDIR /app

COPY v3/package.json v3/package-lock.json ./v3/
WORKDIR /app/v3
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

WORKDIR /app
COPY v3/pure-server.js ./v3/pure-server.js
COPY v3/start-with-admin.js ./v3/start-with-admin.js

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const port = process.env.PORT || 10000; require('http').get('http://127.0.0.1:' + port + '/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

CMD ["node", "v3/start-with-admin.js"]
