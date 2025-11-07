# This dockerfile assumes a cwd of ../ (parent of backend folder)

FROM oven/bun AS build

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=node:22 /usr/local/bin/node /usr/local/bin/node
COPY . .

RUN bun install
RUN bun run --cwd backend build

FROM oven/bun

WORKDIR /usr/src/app

ARG NODE_ENV=production
ARG PORT=3000
ARG DATABASE_URL

ENV NODE_ENV=${NODE_ENV}
ENV PORT=${PORT}
ENV DATABASE_URL=${DATABASE_URL}

COPY --from=node:22 /usr/local/bin/node /usr/local/bin/node
COPY ./bun.lock ./bun.lock
COPY ./package.json ./package.json
RUN mkdir "backend"
COPY ./backend/package.json ./backend/package.json
COPY --from=build /usr/src/app/backend/dist ./backend/dist

CMD [ "bun", "run", "--cwd", "backend", "dist/index.js" ]
