extends Control

func _on_play_pressed():
	AuthoritativeServerConnection.SendReady()
