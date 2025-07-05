using Godot;
using Godot.Collections;

public class ClientDeclarationPacket : ServerboundPacket {
    public string AccessToken { get; set; }

    public ClientDeclarationPacket() {
        Id = PacketId.ClientDeclaration;
    }

    public override Variant Serialize() {
        var dictionary = base.Serialize().AsGodotDictionary();
        dictionary["accessToken"] = AccessToken;
        return dictionary;
    }
}