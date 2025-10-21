extends Node

var next_scene: String = "res://scenes/connecting_menu.tscn"
var loading_scene: PackedScene = preload("res://scenes/loading.tscn")

func force_scene_change(scene_path: String) -> void:
	next_scene = scene_path
	get_tree().change_scene_to_packed(loading_scene)
