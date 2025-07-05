using Godot;
using Godot.Collections;

public class ServerboundPacket : Packet {
    public virtual Variant Serialize() {
        var dictionary = new Dictionary();
        return dictionary;
    }
}