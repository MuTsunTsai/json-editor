import type { JsonTreeNode, NodeType } from "../types/json-tree";

/**
 * 對 JsonTreeNode 樹狀結構的純 mutation 函式集合。
 *
 * 這些函式接受 root 作為第一個參數而非從 closure 取得，
 * 因此可以同時被用在「真實 reactive root」與「mutative draft proxy」上。
 * 後者是 travels 套件追蹤變更產生 JSON Patch 的關鍵——所有要被記入歷史的 mutation
 * 必須走 mutative 的 draft，而不是直接 mutate reactive 物件參考。
 */

/** 從 root walk 找節點。回傳節點本身與其在父節點 children 陣列中的索引。 */
export function findNode(
	root: JsonTreeNode,
	id: string,
): { node: JsonTreeNode; parent: JsonTreeNode | null; index: number } | null {
	if (root.id === id) {
		return { node: root, parent: null, index: -1 };
	}
	const stack: { node: JsonTreeNode; parent: JsonTreeNode; index: number }[] = [];
	root.children.forEach((child, i) => {
		stack.push({ node: child, parent: root, index: i });
	});
	while (stack.length > 0) {
		const entry = stack.pop()!;
		if (entry.node.id === id) {
			return entry;
		}
		entry.node.children.forEach((child, i) => {
			stack.push({ node: child, parent: entry.node, index: i });
		});
	}
	return null;
}

function reindexArray(node: JsonTreeNode) {
	node.children.forEach((child, i) => {
		child.key = String(i);
	});
}

function deduplicateKey(key: string, parent: JsonTreeNode, selfId: string): string {
	const existingKeys = new Set(
		parent.children.filter((c) => c.id !== selfId).map((c) => c.key),
	);
	if (!existingKeys.has(key)) return key;

	let i = 1;
	while (existingKeys.has(`${key}_${i}`)) {
		i++;
	}
	return `${key}_${i}`;
}

export function updateNodeValue(
	root: JsonTreeNode,
	id: string,
	newValue: string | number | boolean | null,
) {
	const found = findNode(root, id);
	if (found) {
		found.node.value = newValue;
	}
}

export function updateNodeKey(root: JsonTreeNode, id: string, newKey: string) {
	const found = findNode(root, id);
	if (found) {
		found.node.key = newKey;
	}
}

export function updateNodeType(root: JsonTreeNode, id: string, newType: NodeType) {
	const found = findNode(root, id);
	if (!found) return;
	const node = found.node;
	if (node.type === newType) return;

	const isContainer = newType === "object" || newType === "array";
	const wasContainer = node.type === "object" || node.type === "array";

	if (wasContainer && !isContainer) {
		// 容器 → 葉節點：移除所有子節點
		node.children = [];
	}

	node.type = newType;

	if (isContainer) {
		node.value = null;
		if (!wasContainer) {
			node.children = [];
		}
	} else {
		// 設定預設值
		switch (newType) {
			case "string": node.value = ""; break;
			case "number": node.value = 0; break;
			case "boolean": node.value = false; break;
			case "null": node.value = null; break;
		}
	}
}

export function deleteNode(root: JsonTreeNode, id: string) {
	const found = findNode(root, id);
	if (!found || !found.parent) return; // 不能刪除根節點

	const parent = found.parent;
	const index = parent.children.indexOf(found.node);
	if (index !== -1) {
		parent.children.splice(index, 1);
	}

	if (parent.type === "array") {
		reindexArray(parent);
	}
}

export function addChild(root: JsonTreeNode, parentId: string, type: NodeType = "string") {
	const found = findNode(root, parentId);
	if (!found) return;
	const parent = found.node;
	if (parent.type !== "object" && parent.type !== "array") return;

	const id = crypto.randomUUID();
	const key = parent.type === "array" ? String(parent.children.length) : "newKey";
	const defaultValue = type === "string" ? "" : type === "number" ? 0 : type === "boolean" ? false : null;
	const isContainer = type === "object" || type === "array";

	const newNode: JsonTreeNode = {
		id,
		key,
		type,
		value: isContainer ? null : defaultValue,
		children: [],
		parentId,
		collapsed: false,
	};

	parent.children.push(newNode);
}

export function moveNode(
	root: JsonTreeNode,
	nodeId: string,
	targetParentId: string,
	newIndex: number,
) {
	const foundNode = findNode(root, nodeId);
	const foundTarget = findNode(root, targetParentId);
	if (!foundNode || !foundTarget) return;

	const node = foundNode.node;
	const targetParent = foundTarget.node;

	// 防止將節點移入自身或其後代
	if (findNode(node, targetParentId)) return;

	// 從舊的父節點移除
	if (foundNode.parent) {
		const oldParent = foundNode.parent;
		const oldIndex = oldParent.children.indexOf(node);
		if (oldIndex !== -1) {
			oldParent.children.splice(oldIndex, 1);
		}
		if (oldParent.type === "array") {
			reindexArray(oldParent);
		}
	}

	// 插入新的父節點
	node.parentId = targetParentId;
	targetParent.children.splice(newIndex, 0, node);

	if (targetParent.type === "array") {
		// 陣列：丟棄原有 key，用索引重新編號
		reindexArray(targetParent);
	} else if (targetParent.type === "object") {
		// 物件：檢查 key 是否撞名，撞了就加後綴
		node.key = deduplicateKey(node.key, targetParent, node.id);
	}
}

export function reorderChildren(
	root: JsonTreeNode,
	parentId: string,
	oldIndex: number,
	newIndex: number,
) {
	const found = findNode(root, parentId);
	if (!found) return;
	const parent = found.node;

	const [moved] = parent.children.splice(oldIndex, 1);
	parent.children.splice(newIndex, 0, moved);

	if (parent.type === "array") {
		reindexArray(parent);
	}
}
