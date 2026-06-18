using System.Collections.Generic;
using Echoform.Protocol;
using Godot;

public partial class FeatureFlagStore : Node {
    public static FeatureFlagStore Instance { get; private set; }

    public List<ServerWelcomeFeatureFlagsItem> Flags { get; set; } = new();

    public FeatureFlagStore() {
        if (Instance != null) {
            EchoformLogger.Default.Error("FeatureFlagStore instance already exists. Destroying duplicate.");
            QueueFree();
            return;
        }

        Instance = this;

        if (OS.IsDebugBuild() || Engine.IsEditorHint()) {
            Flags.Add(ServerWelcomeFeatureFlagsItem.enableDebugMode);
        }
    }
}