import { reactive, ref, type Ref } from "vue";
import type { JsonTreeNode, NodeType } from "../types/json-tree";

function jsonToTree(key: string, value: unknown, parentId: string | null): JsonTreeNode {
	const id = crypto.randomUUID();

	if (value === null) {
		return reactive({ id, key, type: "null", value: null, children: [], parentId, collapsed: false }) as JsonTreeNode;
	}

	if (Array.isArray(value)) {
		const node: JsonTreeNode = reactive({ id, key, type: "array", value: null, children: [] as JsonTreeNode[], parentId, collapsed: false }) as JsonTreeNode;
		node.children = value.map((item, i) => jsonToTree(String(i), item, id));
		return node;
	}

	if (typeof value === "object") {
		const node: JsonTreeNode = reactive({ id, key, type: "object", value: null, children: [] as JsonTreeNode[], parentId, collapsed: false }) as JsonTreeNode;
		node.children = Object.entries(value as Record<string, unknown>).map(
			([k, v]) => jsonToTree(k, v, id)
		);
		return node;
	}

	const type: NodeType = typeof value === "number" ? "number"
		: typeof value === "boolean" ? "boolean"
		: "string";

	return reactive({ id, key, type, value: value as string | number | boolean, children: [], parentId, collapsed: false }) as JsonTreeNode;
}

function treeToJson(node: JsonTreeNode): unknown {
	if (node.type === "object") {
		const obj: Record<string, unknown> = {};
		for (const child of node.children) {
			obj[child.key] = treeToJson(child);
		}
		return obj;
	}
	if (node.type === "array") {
		return node.children.map((child) => treeToJson(child));
	}
	return node.value;
}

function walkRegister(node: JsonTreeNode, map: Map<string, JsonTreeNode>) {
	map.set(node.id, node);
	for (const child of node.children) {
		walkRegister(child, map);
	}
}

/**
 * 管理 reactive JSON 樹的根節點與 id → node 索引（nodeMap）。
 *
 * 注意：此 composable 不再提供 mutation 函式。所有變更要走 `tree-ops.ts`
 * 的純函式並透過 `useHistory.record()` 包覆，由 mutative draft 追蹤產生 patches。
 *
 * 例外：`toggleCollapse` 與 `collapseAll` 屬於純 UI 視覺狀態，不應進歷史，
 * 因此保留為直接 mutate reactive 物件的便利函式。
 */
export function useJsonTree() {
	const root: Ref<JsonTreeNode | null> = ref(null);
	const nodeMap = new Map<string, JsonTreeNode>();

	/** 從 root walk 整棵樹重建 nodeMap，用於 mutation 或 undo/redo 之後同步 */
	function rebuildNodeMap() {
		nodeMap.clear();
		if (root.value) {
			walkRegister(root.value, nodeMap);
		}
	}

	function loadJson(raw: unknown) {
		const rootNode = jsonToTree("(root)", raw, null);
		root.value = rootNode;
		rebuildNodeMap();
	}

	function toJson(): unknown {
		if (!root.value) return null;
		return treeToJson(root.value);
	}

	function toggleCollapse(id: string) {
		const node = nodeMap.get(id);
		if (node) {
			node.collapsed = !node.collapsed;
		}
	}

	function collapseAll(collapsed: boolean) {
		for (const node of nodeMap.values()) {
			if (node.type === "object" || node.type === "array") {
				node.collapsed = collapsed;
			}
		}
	}

	return {
		root,
		nodeMap,
		rebuildNodeMap,
		loadJson,
		toJson,
		toggleCollapse,
		collapseAll,
	};
}

export type UseJsonTree = ReturnType<typeof useJsonTree>;
