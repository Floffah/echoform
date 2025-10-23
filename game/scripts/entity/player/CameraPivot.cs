using Godot;

public partial class CameraPivot : Marker3D {
    [ExportGroup("Settings")] [ExportSubgroup("Mouse settings")] [Export(PropertyHint.Range, "0.01,1,0.01")]
    public float MouseSensitivity = 0.01f;

    [ExportSubgroup("Clamp Settings")] [Export]
    public float MaxTilt = Mathf.DegToRad(75);

    private Player player;

    public override void _Ready() {
        player = GetParent<Player>();
        if (player == null) {
            GD.PrintErr("CameraPivot must be a child of Player.");
            GetTree().Quit(1);
        }
    }

    public override void _Input(InputEvent @event) {
        if (Input.IsActionPressed("control_camera") && @event is InputEventMouseMotion mouseMotion) {
            var pivotRotation = GetRotation();

            pivotRotation.X -= mouseMotion.Relative.Y * MouseSensitivity;
            pivotRotation.X = Mathf.Clamp(pivotRotation.X, -MaxTilt, MaxTilt);

            SetRotation(pivotRotation);

            var playerRotation = player.GetRotation();
            playerRotation.Y += -mouseMotion.Relative.X * MouseSensitivity;
            player.SetRotation(playerRotation);
        }
    }
}