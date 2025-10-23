using System;
using Godot;

public partial class PlayerOrbitCamera : Marker3D {
    [ExportGroup("Settings")] [ExportSubgroup("Mouse settings")] [Export(PropertyHint.Range, "0.01,1,0.01")]
    public float MouseSensitivity = 0.01f;

    [ExportSubgroup("Zoom settings")]
    [Export] public float ZoomIncrement = 0.25f;
    [Export] public float MinZoom = 1.5f;
    [Export] public float MaxZoom = 4f;

    [ExportSubgroup("Clamp Settings")] [Export]
    public float MaxTilt = Mathf.DegToRad(75);

    private SpringArm3D springArm;

    public override void _Ready() {
        springArm = GetNode<SpringArm3D>("SpringArm3D");
    }

    public override void _Input(InputEvent @event) {
        if (Input.IsActionPressed("control_camera") && @event is InputEventMouseMotion mouseMotion) {
            var rotation = GetRotation();

            rotation.X -= mouseMotion.Relative.Y * MouseSensitivity;
            rotation.X = Mathf.Clamp(rotation.X, -MaxTilt, MaxTilt);
            rotation.Y += -mouseMotion.Relative.X * MouseSensitivity;

            SetRotation(rotation);
        }
        else if (Input.IsActionJustPressed("zoom_in")) {
            springArm.SpringLength = Mathf.Max(MinZoom, springArm.SpringLength - ZoomIncrement);
            GD.Print("Zoom In: ", springArm.SpringLength);
        }
        else if (Input.IsActionJustPressed("zoom_out")) {
            springArm.SpringLength = Mathf.Min(MaxZoom, springArm.SpringLength + ZoomIncrement);
            GD.Print("Zoom Out: ", springArm.SpringLength);
        }
    }
}