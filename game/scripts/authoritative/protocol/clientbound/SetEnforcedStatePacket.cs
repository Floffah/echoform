using Godot;
using Godot.Collections;

public class SetEnforcedStatePacket : ClientboundPacket {
    public string Key { get; set; }
    public bool Value { get; set; }

    public SetEnforcedStatePacket() {
        Id = PacketId.SetEnforcedState;
    }

    public override void Deserialize(Dictionary dictionary) {
        Key = dictionary["name"].AsString();
        Value = dictionary["value"].AsBool();
    }

    public override void Handle() {
        AuthoritativeServerConnection.Instance.EnforcedState.Add(Key, Value);

        GD.Print($"Enforced state updated: {Key} = {Value}");
    }
}