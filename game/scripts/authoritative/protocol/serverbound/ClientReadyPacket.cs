
using System.Collections.Generic;
using Godot;

public class ClientReadyPacket : ServerboundPacket {
    public ClientReadyPacket() {
        Id = PacketId.ClientReady;
    }

    public override Variant Serialize() {
        return default;
    }
}