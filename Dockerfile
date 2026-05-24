FROM node:20-alpine

WORKDIR /app

COPY v3/pure-server.js ./v3/pure-server.js

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const port = process.env.PORT || 10000; require('http').get('http://127.0.0.1:' + port + '/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

CMD ["node", "v3/pure-server.js"]
