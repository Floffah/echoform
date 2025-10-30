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
        EchoformLogger.Default.Debug($"Forcing scene change to: {SceneName}");

        var loadingGlobal = AuthoritativeServerConnection.Instance.GetTree().Root.GetNode("/root/GlobalLoading");
        if (!SceneNames.Map.TryGetValue(SceneName, out var scene_path)) {
            EchoformLogger.Default.Error($"Forced scene name '{SceneName}' not found in SceneNames.Map.");
            return;
        }

        loadingGlobal.Call("force_scene_change", scene_path);
    }
}