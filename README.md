My attempt at making an MMO game using Godot and Bun.

Packages:

- [backend](./backend) - (Bun) The authoritative server for the game. Manages player profiles, load balancing, and realtime
- [game](./game) - (Godot) The game client (and server) that players interact with.
- [localfly](./localfly) - (Bun) A service that simulated the fly.io machines API locally