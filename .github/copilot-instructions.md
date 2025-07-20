# Echoform Project Copilot Instructions

Echoform is an MMORPG game that has a spiritual story and focuses on social interaction.

Refer to README.md in the root and each of the project folders for structure refernce.

Brief directory name summary:
- `/backend` - (Bun, Typescript) The authoritative server for the MMO game. Game clients connect to this first to authorise, get their player data, and get routed to a game server.
- `/game` - The Godot codebase for the game its self. This is what players install, and also builds using Godot's headless mode to become the game server.
- `/localfly` - A server that mocks the Fly.io Machines API locally. For information on what this should act like: see https://docs.machines.dev or download Fly.io's OpenAPI schema at https://docs.machines.dev/spec/openapi3.json - as we aren't using the machines api just yet, this isn't necessary but work will need to be done to get it to wor

## Authoritative Server (`/backend`)

When working on this it you will gain the best experience by setting your current working directory (cd) to this directory.

Technical details for this include:
- All package management and running must be done via Bun. If something is broken due to versioning, the bun version that is recommended is in the package.json of the backend, but in most cases installing the latests is best.
- Install packages with `bun install` or `bun add`
- Run tests with `bun test`
- If you need to run it or test it, you likely need the redis server and database server to run. I have provided a docker-compose.yml that you can use to immediately start up these services with everything you need. On a fresh run, you may need to run `bun db:migrate` to apply the migrations to the postgres database
- You should always run the tests before submitting code as a PR (in chat you don't need to), and almost always write tests unless there is no good interface into the code you wrote.
- To build the code you should run `bun run build` (not `bun build`) to make sure it builds properly.
- You should lint the code with `bun lint` and use `tsc --noEmit` to make sure there are no type issues. `tsc --noEmit` is less stable as we are using Bun, but it should work!

If nothing is connecting you might need to write a .env file. For local development this will suffice:
```dotenv
VALKEY_URL="redis://127.0.0.1:6379"
DATABASE_URL="postgres://echoform@localhost:5432/echoform-authoritative"
```

Everything except for user authentication should be done via the websocket server (look for game client connection or GameClientConnection). If the codebase is not at a point where its easy to implement a certain packet or action, simply just add the schema definitions and we can implement the logic later! For example. Cosmetics do not need an endpoint or request response. When another player joins the game server, the authoritative server will tell the game server the players cosmetics and send it more data when they change.

## Game (`/game`)

You will likely never need to touch this, however if you do: as AI models aren't trained on enough recent sources about Godot, you must look up and verify EVERYTHING you do otherwise there's a good chance it wont work. Do not try to implement shaders as the shader format Godot uses is something that AI was not trained on.

You should try as much as you can to just implement c#code and a human will hook it into the game where necessary.

Something to note is that I consider the game server and client to be **stateless** which means that they can run an infinite number of times in any environment without required information. Any information they do need, is *given* to them by the authoritative server which holds the state of users, servers, etc. The game client and server will never request information from the authoritativev server, with the only exception being when the game client needs to authenticate.

## Localfly

Most of these implementation details are the same as the authoritative server (`/backend`) however a few things are different:
- No docker-compose.yml. If you are working on this and need it, feel free to add it! It should be the same as the backend but no redis/valkey is needed, and the database should probably be on a different port

## Authoritative Server vs Game Server

The key difference between these two 'backends' is that the authoritative server handles player data, authentication, cosmetics, game server load balancing, and game server routing. The Game Server is just a headless build of the game so that all player movement and in game actions are done in one codebase and can easily apply some level of anticheat without implementing anything twice or sometimes even at all because a lot of features of this are inherent to the architecture and Godot.