extends Node2D

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	ResourceLoader.load_threaded_request(GlobalLoading.next_scene)

func _process(delta: float) -> void:
	var progress = []
	var status = ResourceLoader.load_threaded_get_status(GlobalLoading.next_scene, progress)
	if status == ResourceLoader.THREAD_LOAD_IN_PROGRESS or status == ResourceLoader.THREAD_LOAD_LOADED:
		$progress_percent.text = str(progress[0] * 100) + "%"
		if progress[0] == 1:
			var packed_scene = ResourceLoader.load_threaded_get(GlobalLoading.next_scene)
			get_tree().change_scene_to_packed(packed_scene)
