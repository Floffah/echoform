using Godot;
using Godot.Collections;

public class ForceScenePacket : ClientboundPacket {
    public string SceneName { get; set; }

    public ForceScenePacket() {
        Id = PacketId.ForceScene;
    }

    public override void Deserialize(Dictionary dictionary) {
        SceneName = dictionary["scene"].AsString();
    }

    public override void Handle() {
        GD.Print($"Forcing scene change to: {SceneName}");

        var loadingGlobal = AuthoritativeServerConnection.Instance.GetTree().Root.GetNode("/root/GlobalLoading");
        var scene_path = SceneNames.Map[SceneName];

        loadingGlobal.Call("force_scene_change", scene_path);
    }
}