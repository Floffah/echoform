using Godot;
using System;

public partial class Player : CharacterBody3D {
    public const float Speed = 5.0f;
    public const float JumpVelocity = 4.5f;

    private AnimationPlayer characterAnimations;
    private Marker3D cameraPivot;

    public override void _Ready() {
        characterAnimations = GetNode<AnimationPlayer>("blockbench_export/AnimationPlayer");
        cameraPivot = GetNode<Marker3D>("Pivot");
    }

    public override void _PhysicsProcess(double delta) {
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
        // As good practice, you should replace UI actions with custom gameplay actions.
        Vector2 inputDir = Input.GetVector("move_left", "move_right", "move_forwards", "move_backwards");
        Vector3 direction = (Transform.Basis * new Vector3(inputDir.X, 0, inputDir.Y)).Normalized();
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

        if (Mathf.Abs(Velocity.X) > 0.1f || Mathf.Abs(Velocity.Z) > 0.1f) {
            characterAnimations.Play("walk");
        }
        else {
            characterAnimations.Stop();
        }
    }
}