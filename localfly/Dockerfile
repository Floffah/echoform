FROM oven/bun AS build

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=node:22 /usr/local/bin/node /usr/local/bin/node
COPY . .

RUN bun install
RUN bun run compile

FROM oven/bun

WORKDIR /usr/src/app

ARG NODE_ENV=production
ARG PORT=3000
ARG LOG_LEVEL=info

ENV NODE_ENV=${NODE_ENV}
ENV PORT=${PORT}
ENV LOG_LEVEL=${LOG_LEVEL}

COPY --from=build /usr/src/app/dist/localfly /usr/local/bin/localfly

CMD [ "localfly" ]
