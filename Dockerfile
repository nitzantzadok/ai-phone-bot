FROM node:20.18.0-slim as base
WORKDIR /app

FROM base as build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3
COPY package-lock.json package.json ./
RUN npm install
COPY . .

FROM base
COPY --from=build /app /app
EXPOSE 8080
CMD ["node", "src/server.js"]
