using Godot;
using System;

public partial class Player : CharacterBody3D {
    [Export] public float Speed = 5.0f;
    [Export] public float JumpVelocity = 4.5f;
    [Export] public float RotateSpeed = 10.0f;

    [Export] public PlayerOrbitCamera CameraRig;
    [Export] public float CameraDistanceY = 1f;

    public bool ControlEnabled = true;

    private AnimationPlayer characterAnimations;

    public override void _Ready() {
        characterAnimations = GetNode<AnimationPlayer>("blockbench_export/AnimationPlayer");
    }

    public override void _PhysicsProcess(double delta) {
        if (!ControlEnabled) {
            return;
        }

        Vector3 velocity = Velocity;

        // Add the gravity.
        if (!IsOnFloor()) {
            velocity += GetGravity() * (float)delta;
        }

        // Handle Jump.
        if (Input.IsActionJustPressed("jump") && IsOnFloor()) {
            velocity.Y = JumpVelocity;
        }

        // Get the input direction and handle the movement/deceleration.
        Vector2 inputDir = Input.GetVector("move_left", "move_right", "move_forwards", "move_backwards");

        Vector3 direction =
            ((CameraRig.GlobalTransform.Basis.X * inputDir.X) + (CameraRig.GlobalTransform.Basis.Z * inputDir.Y))
            .Normalized();

        if (direction.Length() > 0.1f) {
            var targetAngle = Mathf.Atan2(direction.X, direction.Z);
            var smoothedAngle = Mathf.LerpAngle(Rotation.Y, targetAngle, delta * RotateSpeed);
            SetRotation(
                new Vector3(0, (float)smoothedAngle, 0)
            );
        }

        if (direction != Vector3.Zero) {
            velocity.X = direction.X * Speed;
            velocity.Z = direction.Z * Speed;
        }
        else {
            velocity.X = Mathf.MoveToward(Velocity.X, 0, Speed);
            velocity.Z = Mathf.MoveToward(Velocity.Z, 0, Speed);
        }

        Velocity = velocity;
        MoveAndSlide();

        CameraRig.Position = GlobalPosition + new Vector3(0, CameraDistanceY, 0);

        if (Mathf.Abs(Velocity.X) > 0.1f || Mathf.Abs(Velocity.Z) > 0.1f) {
            characterAnimations.Play("walk");
        }
        else {
            characterAnimations.Stop();
        }
    }
}