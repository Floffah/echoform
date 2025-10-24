extends CenterContainer

func _on_dismiss_button_pressed() -> void:
	get_tree().queue_delete(self)
