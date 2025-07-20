public class PacketId {
    // clientbound
    public const string KeepAlive = "keepalive";
    public const string Acknowledge = "acknowledge";
    public const string Welcome = "welcome";
    public const string SetEnforcedState = "set_enforced_state";

    // serverbound
    public const string ClientDeclaration = "client_declaration";
    public const string ClientReady = "client_ready";
}