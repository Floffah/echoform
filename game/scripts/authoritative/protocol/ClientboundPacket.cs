using Godot;
using Godot.Collections;

public class ClientboundPacket : Packet {
    public virtual void Deserialize(Dictionary dictionary) {
    }

    public virtual void Handle() {
        GD.Print("No handler implemented for packet: ", Id);
    }
}