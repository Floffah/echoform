using Godot;
using Godot.Collections;

public class ClientReadyPacket : ServerboundPacket {
    public ClientReadyPacket() {
        Id = PacketId.ClientReady;
    }

    public override Variant Serialize() {
        return new Dictionary();
    }
}
