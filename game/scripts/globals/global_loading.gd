extends Node

var next_scene: String = "res://scenes/connecting_menu.tscn"
var loading_scene: PackedScene = preload("res://scenes/loading.tscn")

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	pass # Replace with function body.

func force_scene_change(scene_path: String) -> void:
	next_scene = scene_path
	get_tree().change_scene_to_packed(loading_scene)
