using Godot.Collections;

public class WelcomePacket : ClientboundPacket {
    public string ServerVersion { get; set; }
    public string Environment { get; set; }
    public string[] FeatureFlags { get; set; }

    public WelcomePacket() {
        Id = PacketId.Welcome;
    }

    public override void Deserialize(Dictionary dictionary) {
        ServerVersion = dictionary["serverVersion"].AsString();
        Environment = dictionary["environment"].AsString();
        FeatureFlags = dictionary["featureFlags"].AsStringArray();
    }
}