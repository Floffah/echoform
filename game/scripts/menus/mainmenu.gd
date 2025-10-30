extends Control

func _ready() -> void:
	AuthoritativeServerConnection.Connected.connect(_on_connected)

func _on_connected() -> void:
	$ButtonsContainer/MarginContainer/VBoxContainer/ConnectingLabel.visible = false
	$ButtonsContainer/MarginContainer/VBoxContainer/ActionButtonsVBox.visible = true

func _on_continue_button_pressed() -> void:
	AuthoritativeServerConnection.SendReady()
