extends Node2D

func _on_play_pressed():
	AuthoritativeServerConnection.SendReady()
