FROM node:22-alpine

WORKDIR /app
COPY index.html styles.css app.js data.js server.cjs ./
RUN mkdir /data && chown node:node /data
ENV DATA_DIR=/data
ENV PORT=8080
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.cjs"]
