public class PacketId {
    // clientbound
    public const string Welcome = "server.welcome";
    public const string SetEnforcedState = "server.set_enforced_state";
    public const string ForceScene = "server.force_scene";

    // serverbound
    public const string ClientDeclaration = "client.hello";
    public const string ClientReady = "client.ready";
}
