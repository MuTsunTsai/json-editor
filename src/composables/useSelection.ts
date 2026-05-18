import { ref } from "vue";

export type EditMode = "key" | "value" | "containerType" | null;

export function useSelection() {
	const selectedNodeId = ref<string | null>(null);

	// 全域編輯狀態：哪個節點的哪個部分正在被編輯
	const editingNodeId = ref<string | null>(null);
	const editingMode = ref<EditMode>(null);

	function selectNode(id: string) {
		selectedNodeId.value = id;
	}

	function clearSelection() {
		selectedNodeId.value = null;
	}

	function startEditing(nodeId: string, mode: EditMode) {
		editingNodeId.value = nodeId;
		editingMode.value = mode;
	}

	function stopEditing() {
		editingNodeId.value = null;
		editingMode.value = null;
	}

	function isEditing(nodeId: string, mode: EditMode): boolean {
		return editingNodeId.value === nodeId && editingMode.value === mode;
	}

	return {
		selectedNodeId,
		editingNodeId,
		editingMode,
		selectNode,
		clearSelection,
		startEditing,
		stopEditing,
		isEditing,
	};
}

export type UseSelection = ReturnType<typeof useSelection>;
