extends Node2D

var loading_screen = preload("res://scripts/menus/loading.gd")

func _on_play_pressed():
	AuthoritativeServerConnection.SendReady()
