<template>
	<div class="d-flex flex-column vh-100">
		<AppToolbar
			:file-name="fileIO.fileName.value"
			:has-data="!!tree.root.value"
			:can-undo="history.canUndo.value"
			:can-redo="history.canRedo.value"
			@open="handleOpen"
			@save="handleSave"
			@save-as="handleSaveAs"
			@copy="handleCopy"
			@paste="handlePaste"
			@undo="history.undo"
			@redo="history.redo"
		/>
		<main class="flex-grow-1 overflow-auto p-3">
			<template v-if="tree.root.value">
				<div class="flat-tree">
					<JsonNodeRow :row="rootHeaderRow!" :is-root="true" />
					<SlickList
						:list="innerList"
						:use-drag-handle="true"
						axis="y"
						lock-axis="y"
						helper-class="drag-helper"
						:transition-duration="150"
						@sort-start="onSortStart"
						@sort-end="onSortEnd"
					>
						<SlickItem
							v-for="(row, index) in innerList"
							:key="row.id"
							:index="index"
							:class="{ 'hidden-row': hiddenRowIds.has(row.id) }"
						>
							<JsonNodeRow
								v-show="!hiddenRowIds.has(row.id)"
								:row="row"
							/>
						</SlickItem>
					</SlickList>
					<JsonNodeRow :row="rootCloseRow!" />
				</div>
			</template>
			<div v-else class="text-muted text-center mt-5">
				<p>點擊「開啟」來載入 JSON 檔案</p>
			</div>
		</main>
	</div>
</template>

<script setup lang="ts">
	import { computed, provide, onMounted, onUnmounted, ref, watch } from "vue";
	import { SlickList, SlickItem } from "vue-slicksort";
	import { jsonTreeKey, selectionKey, draggingNodeIdKey, prepareDragKey, recordHistoryKey } from "./types/json-tree";
	import { useJsonTree } from "./composables/useJsonTree";
	import { useFileIO } from "./composables/useFileIO";
	import { useSelection } from "./composables/useSelection";
	import { useFlatList, type FlatRow } from "./composables/useFlatList";
	import { useHistory } from "./composables/useHistory";
	import * as ops from "./composables/tree-ops";
	import AppToolbar from "./components/AppToolbar.vue";
	import JsonNodeRow from "./components/JsonNodeRow.vue";

	const tree = useJsonTree();
	const fileIO = useFileIO();
	const selection = useSelection();
	const { flatList, resolveDropTarget } = useFlatList(tree);
	const history = useHistory(tree);

	provide(jsonTreeKey, tree);
	provide(selectionKey, selection);
	provide(recordHistoryKey, history.record);

	/** 載入新 JSON 並重置歷史 */
	function loadJsonAndResetHistory(raw: unknown) {
		tree.loadJson(raw);
		history.init();
	}

	interface DraggableRow extends FlatRow {
		id: string;
	}

	const draggableList = ref<DraggableRow[]>([]);
	const draggingNodeId = ref<string | null>(null);
	provide(draggingNodeIdKey, draggingNodeId);

	// root 的 header 和 close 行，在 SlickList 外面渲染
	const rootHeaderRow = computed(() => draggableList.value[0] ?? null);
	const rootCloseRow = computed(() => {
		const last = draggableList.value[draggableList.value.length - 1];
		return last?.isClose ? last : null;
	});
	// SlickList 內的列表：去掉 root header 和 root close
	const innerList = computed(() => draggableList.value.slice(1, rootCloseRow.value ? -1 : undefined));

	// 拖曳開始前的精簡列表快照（移除子行後），用於 onSortEnd 計算
	let compactListBeforeDrag: DraggableRow[] = [];

	watch(flatList, (rows) => {
		if (!draggingNodeId.value) {
			draggableList.value = rows.map((row) => ({
				...row,
				id: row.isClose ? `close-${row.node.id}` : row.node.id,
			}));
		}
	}, { immediate: true });

	let wasCollapsedBeforeDrag = false;

	// 拖曳中被隱藏的子行 ID 集合
	const hiddenRowIds = ref(new Set<string>());

	/**
	 * mousedown 時提前呼叫：摺疊容器節點，隱藏子行（高度歸零）。
	 */
	function prepareDrag(nodeId: string) {
		draggingNodeId.value = nodeId;

		// 如果是展開的容器，記住原狀態後摺疊
		const node = tree.nodeMap.get(nodeId);
		if (node) {
			const isContainer = node.type === "object" || node.type === "array";
			wasCollapsedBeforeDrag = node.collapsed;
			if (isContainer && !node.collapsed) {
				tree.toggleCollapse(nodeId);
			}
		}

		// 標記子行為隱藏（高度歸零，不從列表移除）
		const list = innerList.value;
		const index = list.findIndex((r) => r.id === nodeId);
		if (index === -1) return;

		const startDepth = list[index].depth;
		const ids = new Set<string>();
		for (let i = index + 1; i < list.length; i++) {
			const r = list[i];
			if (r.depth <= startDepth && !(r.isClose && r.node.id === nodeId)) {
				break;
			}
			ids.add(r.id);
		}
		hiddenRowIds.value = ids;
	}

	provide(prepareDragKey, prepareDrag);

	function onSortStart() {
		// prepareDrag 已在 mousedown 時完成，這裡只保存快照
		compactListBeforeDrag = [...innerList.value];
	}

	function restoreDragState() {
		// 恢復拖曳前的展開狀態
		if (draggingNodeId.value && !wasCollapsedBeforeDrag) {
			tree.toggleCollapse(draggingNodeId.value);
		}
		hiddenRowIds.value = new Set();
		draggingNodeId.value = null;
		syncFromFlatList();
	}

	function onSortEnd({ oldIndex, newIndex }: { oldIndex: number; newIndex: number }) {
		if (oldIndex === newIndex || !draggingNodeId.value) {
			restoreDragState();
			return;
		}

		const movedNode = tree.nodeMap.get(draggingNodeId.value);
		if (!movedNode) {
			restoreDragState();
			return;
		}

		// 在精簡列表上模擬移動：移除 oldIndex，插入 newIndex
		const simulated = [...compactListBeforeDrag];
		const [removed] = simulated.splice(oldIndex, 1);
		simulated.splice(newIndex, 0, removed);

		// 在模擬後的列表上用 resolveDropTarget 計算目標
		const target = resolveDropTarget(simulated, removed, newIndex, hiddenRowIds.value);

		if (target) {
			const oldParent = movedNode.parentId ? tree.nodeMap.get(movedNode.parentId) : null;

			if (oldParent && target.parentId === oldParent.id) {
				// 同父節點 reorder
				const currentIndex = oldParent.children.indexOf(movedNode);
				let adjustedIndex = target.childIndex;
				if (currentIndex < adjustedIndex) {
					adjustedIndex--;
				}
				if (currentIndex !== adjustedIndex) {
					const parentId = oldParent.id;
					history.record((root) => ops.reorderChildren(root, parentId, currentIndex, adjustedIndex));
				}
			} else {
				// 跨層級移動
				const movedId = movedNode.id;
				const targetParentId = target.parentId;
				const childIndex = target.childIndex;
				history.record((root) => ops.moveNode(root, movedId, targetParentId, childIndex));
			}
		}

		restoreDragState();
	}

	function syncFromFlatList() {
		draggableList.value = flatList.value.map((row) => ({
			...row,
			id: row.isClose ? `close-${row.node.id}` : row.node.id,
		}));
	}

	async function handleOpen() {
		try {
			const text = await fileIO.openFile();
			const parsed = JSON.parse(text);
			loadJsonAndResetHistory(parsed);
		} catch (e) {
			if ((e as Error).name !== "AbortError") {
				alert(`開啟檔案失敗: ${(e as Error).message}`);
			}
		}
	}

	async function handleSave() {
		try {
			const json = tree.toJson();
			const text = JSON.stringify(json, null, "\t");
			await fileIO.saveFile(text);
		} catch (e) {
			if ((e as Error).name !== "AbortError") {
				alert(`儲存失敗: ${(e as Error).message}`);
			}
		}
	}

	async function handleSaveAs() {
		try {
			const json = tree.toJson();
			const text = JSON.stringify(json, null, "\t");
			await fileIO.saveFileAs(text);
		} catch (e) {
			if ((e as Error).name !== "AbortError") {
				alert(`儲存失敗: ${(e as Error).message}`);
			}
		}
	}

	// 用 capture phase 攔截所有 click，不受子元素 stopPropagation 影響
	// 如果點擊路徑中有 [data-editing-area]，不退出編輯
	function onDocumentClick(e: MouseEvent) {
		const path = e.composedPath() as HTMLElement[];
		const inEditingArea = path.some((el) => el.dataset?.editingArea !== undefined);
		if (!inEditingArea) {
			selection.stopEditing();
			selection.clearSelection();
		}
	}

	async function handleCopy() {
		const json = tree.toJson();
		const text = JSON.stringify(json, null, "\t");
		await navigator.clipboard.writeText(text);
	}

	async function handlePaste() {
		try {
			const text = await navigator.clipboard.readText();
			const parsed = JSON.parse(text);
			loadJsonAndResetHistory(parsed);
		} catch {
			// parse 錯誤則忽略
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement).tagName;
		const isInput = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";

		// undo/redo:只在非編輯模式下響應
		if (!isInput && !selection.editingNodeId.value && (e.ctrlKey || e.metaKey)) {
			if (e.key === "z" || e.key === "Z") {
				e.preventDefault();
				history.undo();
				selection.clearSelection();
				return;
			}
			if (e.key === "y" || e.key === "Y") {
				e.preventDefault();
				history.redo();
				selection.clearSelection();
				return;
			}
		}

		if (!selection.selectedNodeId.value) return;
		if (isInput) return;

		if (e.key === "Backspace" || e.key === "Delete") {
			e.preventDefault();
			const id = selection.selectedNodeId.value;
			history.record((root) => ops.deleteNode(root, id));
			selection.clearSelection();
		}
	}

	// TODO: 開發完成後移除預設資料
	const sampleData = {
		"name": "JSON 編輯器",
		"version": 1.0,
		"features": ["tree view", "drag & drop", "inline edit"],
		"config": {
			"theme": "dark",
			"autosave": true,
			"nested": {
				"deep": "value",
				"count": 42
			}
		},
		"active": true,
		"description": null
	};

	onMounted(() => {
		document.addEventListener("click", onDocumentClick, true);
		document.addEventListener("keydown", onKeyDown);
		loadJsonAndResetHistory(sampleData);
	});

	onUnmounted(() => {
		document.removeEventListener("click", onDocumentClick, true);
		document.removeEventListener("keydown", onKeyDown);
	});
</script>

<style>
	.flat-tree {
		font-family: var(--font-mono);
		font-size: 14px;
	}

	.hidden-row {
		height: 0 !important;
		overflow: hidden;
		margin: 0 !important;
		padding: 0 !important;
	}

	.drag-helper {
		background: var(--drag-helper-bg);
		backdrop-filter: blur(4px);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		opacity: 0.9;
		z-index: 9999;
	}
</style>
