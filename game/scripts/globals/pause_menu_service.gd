extends Node

var pause_menu_scene: PackedScene = preload("res://scenes/pause_menu.tscn")

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("escape"):
		var pauseMenuNode: Node = get_tree().get_root().get_node_or_null("/root/PauseMenu")

		if pauseMenuNode != null:
			pauseMenuNode.resume()
		else:
			get_tree().paused = true
			var pause_menu_instance: Control = pause_menu_scene.instantiate()
			get_tree().get_root().add_child(pause_menu_instance)
