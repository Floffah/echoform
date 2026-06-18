using System.Collections.Generic;
using System.Linq;
using Echoform.Protocol;
using Godot;

public sealed class ClientboundPacketHandler : IClientboundPacketHandler {
    private readonly AuthoritativeServerConnection connection;

    public ClientboundPacketHandler(AuthoritativeServerConnection connection) {
        this.connection = connection;
    }

    public void Handle(ServerErrorPacket packet) {
        EchoformLogger.Default.Error(
            $"Authoritative server error {packet.Data.Code}: {packet.Data.Message ?? "No message provided."}");
    }

    public void Handle(ServerWarningPacket packet) {
        EchoformLogger.Default.Info(
            $"Authoritative server warning {packet.Data.Code}: {packet.Data.Message}");
    }

    public void Handle(ServerKickPacket packet) {
        EchoformLogger.Default.Info($"Authoritative server ended the session: {packet.Data.Reason}");
    }

    public void Handle(ServerWelcomePacket packet) {
        EchoformLogger.Default.Debug(
            $"Connected to authoritative server {packet.Data.ServerVersion} as {packet.Data.ConnectionId}.");
        FeatureFlagStore.Instance.Flags.AddRange(packet.Data.FeatureFlags);
        connection.EmitConnected();
    }

    public void Handle(ServerSetEnforcedStatePacket packet) {
        var name = packet.Data.Name.ToString();
        connection.EnforcedState[name] = packet.Data.Value;
        EchoformLogger.Default.Debug($"Enforced state updated: {name} = {packet.Data.Value}");
    }

    public void Handle(ServerForceScenePacket packet) {
        var sceneName = packet.Data.Scene.ToString();
        EchoformLogger.Default.Debug($"Forcing scene change to: {sceneName}");

        if (!SceneNames.Map.TryGetValue(sceneName, out var scenePath)) {
            EchoformLogger.Default.Error($"Forced scene name '{sceneName}' not found in SceneNames.Map.");
            return;
        }

        var loadingGlobal = connection.GetTree().Root.GetNode("/root/GlobalLoading");
        loadingGlobal.Call("force_scene_change", scenePath);
    }
}
