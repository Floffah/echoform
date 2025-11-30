FROM barichello/godot-ci:mono-4.5.1 AS build

WORKDIR /app
COPY . .

ARG DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=${DOTNET_SYSTEM_GLOBALIZATION_INVARIANT}

#RUN mkdir -v -p ~/.local/share/godot/export_templates/
#RUN mkdir -v -p ~/.config/
#RUN mv /root/.config/godot ~/.config/godot
#RUN mv /root/.local/share/godot/export_templates/4.5.1.stable.mono ~/.local/share/godot/export_templates/4.5.1.stable.mono

RUN mkdir -v -p ./build/server

RUN godot --headless --verbose --export-release "Linux Server" ./build/server/out --main-scene res://scenes/intro.tsc

FROM ubuntu:24.04

WORKDIR /app

COPY --from=build /app/build/server ./
RUN chmod +x ./out

CMD ["./out", "--server"]
EXPOSE 8080/udp
EXPOSE 8080/tcp
