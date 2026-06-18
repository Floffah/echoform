extends Control
class_name PauseMenu

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func resume() -> void:
	get_tree().paused = false
	queue_free()

func _on_quit_to_menu_button_pressed() -> void:
	resume()
	var loadingService: GlobalLoading = get_node("/root/GlobalLoading")
	loadingService.force_scene_change("res://scenes/title_screen/main_menu.tscn")

func _on_quit_pressed() -> void:
	get_tree().quit(0)
