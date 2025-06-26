FROM node:24.3.0 AS build
ARG VERSION
WORKDIR /src

COPY package*.json ./
RUN npm ci

COPY . .
RUN VITE_VERSION="$VERSION" npm run build


FROM caddy:2.10.0

WORKDIR /srv

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv

EXPOSE 3080

ENTRYPOINT ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
