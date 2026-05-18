<template>
	<div
		v-if="row.isClose"
		class="node-row close-row"
		:style="{ paddingLeft: Math.max(0, row.depth) * 20 + 'px' }"
	>
		<span v-if="row.depth >= 0" class="collapse-spacer" />
		<span v-if="row.depth >= 0" class="drag-handle-spacer" />
		{{ row.node.type === "object" ? "}" : "]" }}
	</div>
	<div
		v-else
		class="json-node"
		:class="{ selected: isSelected }"
		@click.stop="selection.selectNode(node.id)"
	>
		<div class="node-row" :style="{ paddingLeft: Math.max(0, row.depth) * 20 + 'px' }">
			<!-- 摺疊按鈕（根節點不顯示） -->
			<button
				v-if="isContainer && !isRoot"
				class="collapse-toggle btn btn-sm p-0"
				@click.stop="tree.toggleCollapse(node.id)"
			>
				<span class="chevron" :class="{ collapsed: showAsCollapsed }">▶</span>
			</button>
			<span v-else-if="!isRoot" class="collapse-spacer" />

			<!-- 拖曳手把（根節點不顯示） -->
			<DragHandle v-if="!isRoot" class="drag-handle" @mousedown="onDragHandleMouseDown">⠿</DragHandle>

			<!-- Key 顯示/編輯（陣列子項目與根節點不顯示 key） -->
			<span
				v-if="showKey"
				class="node-key"
				:data-editing-area="isEditingKey || undefined"
				@dblclick.stop="startEditKey"
			>
				<input
					v-if="isEditingKey"
					ref="keyInputRef"
					v-model="editKeyValue"
					class="inline-input key-input"
					@keydown.enter="commitKeyEdit"
					@keydown.escape="selection.stopEditing()"
				/>
				<template v-else>"{{ node.key }}"</template>
			</span>

			<span v-if="showKey" class="colon">:</span>

			<!-- Value 顯示/編輯 -->
			<template v-if="isContainer">
				<span
					v-if="isEditingContainerType"
					data-editing-area
				>
					<TypeSwitcher
						:type="node.type"
						@update:type="onContainerTypeChange"
					/>
				</span>
				<template v-else>
					<span
						v-if="showAsCollapsed"
						class="collapsed-preview"
						@dblclick.stop="startEditContainerType"
					>
						{{ node.type === "object" ? "{...}" : "[...]" }}
						<span class="item-count badge bg-secondary ms-1">{{ node.children.length }}</span>
					</span>
					<span v-else class="bracket-open" @dblclick.stop="startEditContainerType">
						{{ node.type === "object" ? "{" : "[" }}
					</span>
				</template>
			</template>
			<template v-else>
				<span
					class="node-value"
					:class="['type-' + node.type]"
					:data-editing-area="isEditingValue || undefined"
					@dblclick.stop="startEditValue"
				>
					<template v-if="isEditingValue">
						<TypeSwitcher
							:type="editType"
							@update:type="onTypeChange"
						/>
						<input
							v-if="editType === 'string' || editType === 'number'"
							ref="valueInputRef"
							v-model="editValueRaw"
							class="inline-input value-input"
							@keydown.enter="commitValueEdit"
							@keydown.escape="selection.stopEditing()"
						/>
						<select
							v-else-if="editType === 'boolean'"
							ref="boolSelectRef"
							v-model="editValueRaw"
							class="form-select form-select-sm inline-select"
							@change="commitValueEdit"
						>
							<option value="true">true</option>
							<option value="false">false</option>
						</select>
						<span v-else-if="editType === 'null'" class="type-null">null</span>
					</template>
					<template v-else>
						{{ displayValue }}
					</template>
				</span>
			</template>

			<!-- 新增子項目按鈕 -->
			<button
				v-if="isContainer"
				class="btn btn-sm btn-outline-secondary add-child-btn ms-2"
				title="新增子項目"
				@click.stop="recordHistory((root) => ops.addChild(root, node.id))"
			>+</button>
		</div>

	</div>
</template>

<script setup lang="ts">
	import { computed, inject, ref, nextTick, useTemplateRef, watch } from "vue";
	import { DragHandle } from "vue-slicksort";
	import type { NodeType } from "../types/json-tree";
	import { jsonTreeKey, selectionKey, prepareDragKey, recordHistoryKey } from "../types/json-tree";
	import type { FlatRow } from "../composables/useFlatList";
	import * as ops from "../composables/tree-ops";
	import TypeSwitcher from "./TypeSwitcher.vue";

	const props = defineProps<{
		row: FlatRow;
		isRoot?: boolean;
	}>();

	const tree = inject(jsonTreeKey)!;
	const selection = inject(selectionKey)!;
	const prepareDrag = inject(prepareDragKey)!;
	const recordHistory = inject(recordHistoryKey)!;

	const node = computed(() => props.row.node);
	const isContainer = computed(() => node.value.type === "object" || node.value.type === "array");
	const showAsCollapsed = computed(() => isContainer.value && node.value.collapsed);
	const isSelected = computed(() => selection.selectedNodeId.value === node.value.id);
	const isArrayChild = computed(() => {
		if (!node.value.parentId) return false;
		const parent = tree.nodeMap.get(node.value.parentId);
		return parent?.type === "array";
	});
	const showKey = computed(() => !props.isRoot && !isArrayChild.value);

	// === 全域編輯狀態 ===
	const isEditingKey = computed(() => selection.isEditing(node.value.id, "key"));
	const isEditingValue = computed(() => selection.isEditing(node.value.id, "value"));
	const isEditingContainerType = computed(() => selection.isEditing(node.value.id, "containerType"));

	// 當全域編輯狀態被外部點擊清除時，提交未完成的編輯
	watch(() => selection.editingNodeId.value, (newId, oldId) => {
		if (oldId === node.value.id && newId !== oldId) {
			commitKeyIfEditing();
			commitValueIfEditing();
		}
	});

	// === 拖曳 ===
	function onDragHandleMouseDown() {
		prepareDrag(node.value.id);
	}

	// === Key 編輯 ===
	const editKeyValue = ref("");
	const keyInputEl = useTemplateRef<HTMLInputElement>("keyInputRef");

	function startEditKey() {
		if (props.isRoot) return;
		editKeyValue.value = node.value.key;
		selection.startEditing(node.value.id, "key");
		nextTick(() => keyInputEl.value?.select());
	}

	function commitKeyEdit() {
		commitKeyIfEditing();
		selection.stopEditing();
	}

	function commitKeyIfEditing() {
		if (isEditingKey.value && editKeyValue.value !== node.value.key) {
			const id = node.value.id;
			const newKey = editKeyValue.value;
			recordHistory((root) => ops.updateNodeKey(root, id, newKey));
		}
	}

	// === 容器型別切換 ===
	function startEditContainerType() {
		selection.startEditing(node.value.id, "containerType");
	}

	function onContainerTypeChange(newType: NodeType) {
		selection.stopEditing();
		if (newType === node.value.type) return;
		const id = node.value.id;
		recordHistory((root) => ops.updateNodeType(root, id, newType));
	}

	// === Value 編輯 ===
	const editType = ref<NodeType>("string");
	const editValueRaw = ref("");
	const valueInputEl = useTemplateRef<HTMLInputElement>("valueInputRef");
	const boolSelectEl = useTemplateRef<HTMLSelectElement>("boolSelectRef");

	const displayValue = computed(() => {
		const { type, value } = node.value;
		if (type === "string") return `"${value}"`;
		if (type === "null") return "null";
		return String(value);
	});

	function startEditValue() {
		editType.value = node.value.type;
		editValueRaw.value = node.value.type === "string"
			? (node.value.value as string)
			: String(node.value.value);
		selection.startEditing(node.value.id, "value");
		nextTick(() => valueInputEl.value?.select());
	}

	function onTypeChange(newType: NodeType) {
		editType.value = newType;
		if (newType === "object" || newType === "array") {
			const id = node.value.id;
			recordHistory((root) => ops.updateNodeType(root, id, newType));
			selection.stopEditing();
		} else if (newType === "null") {
			editValueRaw.value = "null";
		} else if (newType === "boolean") {
			editValueRaw.value = "false";
		} else if (newType === "number") {
			editValueRaw.value = "0";
		} else {
			editValueRaw.value = "";
		}
		nextTick(() => {
			if (newType === "string" || newType === "number") {
				valueInputEl.value?.select();
			} else if (newType === "boolean") {
				boolSelectEl.value?.focus();
			}
		});
	}

	function commitValueEdit() {
		commitValueIfEditing();
		selection.stopEditing();
	}

	function commitValueIfEditing() {
		if (!isEditingValue.value) return;

		const type = editType.value;
		let parsedValue: string | number | boolean | null;

		switch (type) {
			case "string":
				parsedValue = editValueRaw.value;
				break;
			case "number":
				parsedValue = Number(editValueRaw.value) || 0;
				break;
			case "boolean":
				parsedValue = editValueRaw.value === "true";
				break;
			case "null":
				parsedValue = null;
				break;
			default:
				parsedValue = null;
		}

		// 沒有實際變更時不記錄歷史
		if (type === node.value.type && parsedValue === node.value.value) return;

		const id = node.value.id;
		recordHistory((root) => {
			ops.updateNodeType(root, id, type);
			ops.updateNodeValue(root, id, parsedValue);
		});
	}
</script>

<style scoped>
	.json-node {
		line-height: 1.6;
	}

	.node-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-top: 1px;
		padding-bottom: 1px;
		padding-right: 6px;
		border-radius: 4px;
		cursor: default;
	}

	.node-row:hover {
		background: var(--node-hover);
	}

	.json-node.selected > .node-row {
		background: var(--node-selected);
		outline: 1px solid rgba(137, 180, 250, 0.3);
	}

	.close-row {
		line-height: 1.6;
		cursor: default;
		color: var(--bs-body-color);
	}

	.drag-handle {
		cursor: grab;
		opacity: 0.3;
		user-select: none;
		font-size: 12px;
		width: 16px;
		text-align: center;
		flex-shrink: 0;
	}

	.drag-handle-spacer {
		width: 16px;
		flex-shrink: 0;
	}

	.node-row:hover .drag-handle {
		opacity: 0.7;
	}

	.collapse-toggle {
		width: 18px;
		height: 18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		color: var(--bs-body-color);
		line-height: 1;
		flex-shrink: 0;
	}

	.chevron {
		display: inline-block;
		transition: transform 0.15s ease;
		transform: rotate(90deg);
	}

	.chevron.collapsed {
		transform: rotate(0deg);
	}

	.collapse-spacer {
		width: 18px;
		display: inline-block;
		flex-shrink: 0;
	}

	.node-key {
		color: var(--text-key);
		cursor: text;
	}

	.colon {
		color: var(--bs-body-color);
		margin-right: 4px;
	}

	.node-value {
		cursor: text;
	}

	.type-string { color: var(--text-string); }
	.type-number { color: var(--text-number); }
	.type-boolean { color: var(--text-boolean); }
	.type-null { color: var(--text-null); font-style: italic; }

	.collapsed-preview {
		color: var(--text-null);
		font-style: italic;
	}

	.bracket-open {
		color: var(--bs-body-color);
	}

	.inline-input {
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--bs-primary);
		color: inherit;
		font-family: inherit;
		font-size: inherit;
		padding: 0 2px;
		outline: none;
		min-width: 40px;
	}

	.key-input {
		color: var(--text-key);
		width: 120px;
	}

	.value-input {
		width: 150px;
	}

	.inline-select {
		display: inline-block;
		width: auto;
		font-size: 12px;
		padding: 1px 2rem 1px 6px;
		height: 22px;
	}

	.add-child-btn {
		font-size: 11px;
		padding: 0 5px;
		line-height: 1.4;
		opacity: 0;
	}

	.node-row:hover .add-child-btn {
		opacity: 1;
	}

	.item-count {
		font-size: 11px;
	}
</style>
