using Godot;

public class PacketTranslator {
    public static Packet GetFromString(string packetString) {
        var dictionary = Json.ParseString(packetString).AsGodotDictionary();

        if (!dictionary.ContainsKey("id")) {
            GD.PrintErr("Packet does not contain 'id' key: ", packetString);
            return null;
        }

        var packetId = dictionary["id"].AsStringName();
        var data = dictionary.ContainsKey("data") ? dictionary["data"] : default;

        GD.Print("Found packet of id: ", packetId);

        ClientboundPacket packet;

        switch (packetId) {
            case PacketId.Welcome:
                packet = new WelcomePacket();
                break;
            case PacketId.SetEnforcedState:
                packet = new SetEnforcedStatePacket();
                break;
            default:
                GD.PrintErr("Unknown packet id: ", packetId);
                return null;
        }

        packet.Id = packetId;
        packet.Deserialize(data.AsGodotDictionary());

        return packet;
    }
}