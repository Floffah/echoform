using Godot;
using System;

public partial class CinematicPlayerCamera : PlayerOrbitCamera {
    [ExportSubgroup("Cinematic Settings")] [Export]
    public bool DefaultAnchored = true;

    [Export] public Player PlayerRef;

    private bool _isAnchored;

    private Vector3 _cinematicTargetPosition;
    private Quaternion _cinematicTargetRotation;
    private readonly float _cinematicLerpSpeed = 3f;

    // Called when the node enters the scene tree for the first time.
    public override void _Ready() {
        base._Ready();
        _isAnchored = DefaultAnchored;
        PlayerRef.ControlEnabled = _isAnchored;
    }

    public override void _Input(InputEvent @event) {
        if (_isAnchored) {
            base._Input(@event);
        }
    }

    public void Detach() {
        _isAnchored = false;
        PlayerRef.ControlEnabled = false;
    }

    public void DetachAndMoveTo(Vector3 targetPosition, Vector3 targetLookAt, float duration = 2.0f) {
        Detach();

        var tween = GetTree().CreateTween();

        // Build target transform
        var targetTransform = new Transform3D().LookingAt(targetLookAt, Vector3.Up);
        targetTransform.Origin = targetPosition;

        // Tween global transform directly
        tween.TweenProperty(this, "global_transform", targetTransform, duration)
            .SetTrans(Tween.TransitionType.Cubic)
            .SetEase(Tween.EaseType.Out);

        // Owptional callback after tween ends
        tween.TweenCallback(Callable.From(() => {
            EchoformLogger.Default.Debug("Cinematic camera move complete.");
            // Optional: trigger next cutscene step
        }));
    }


    public void ReturnToPlayer() {
        _isAnchored = true;
        PlayerRef.ControlEnabled = true;
        // Optionally snap or lerp back to the player position manually
    }
}