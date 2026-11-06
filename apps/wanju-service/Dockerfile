FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4890 WANJU_SERVICE_DB=/data/wallet.sqlite WANJU_CLOUD_DIR=/data/cloud
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /data/cloud && chown -R node:node /data
USER node
EXPOSE 4890
CMD ["node", "server.mjs"]
