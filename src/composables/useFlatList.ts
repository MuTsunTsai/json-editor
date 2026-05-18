import { computed } from "vue";
import type { JsonTreeNode } from "../types/json-tree";
import type { UseJsonTree } from "./useJsonTree";

export interface FlatRow {
	node: JsonTreeNode;
	depth: number;
	/** 這一行是否為容器的關閉括號 */
	isClose: boolean;
}

/**
 * 將樹狀結構展開成扁平列表，用於單一 SlickList 渲染。
 * 容器摺疊時跳過子孫。容器展開時，子孫後面跟一個 close 行。
 */
export function useFlatList(tree: UseJsonTree) {
	const flatList = computed<FlatRow[]>(() => {
		const root = tree.root.value;
		if (!root) return [];
		const rows: FlatRow[] = [];
		// 根節點不顯示手把/箭頭，用 depth=-1 讓子節點從 0 開始
		flatten(root, -1, rows);
		return rows;
	});

	function flatten(node: JsonTreeNode, depth: number, rows: FlatRow[]) {
		rows.push({ node, depth, isClose: false });

		const isContainer = node.type === "object" || node.type === "array";
		if (isContainer && !node.collapsed) {
			for (const child of node.children) {
				flatten(child, depth + 1, rows);
			}
			// 關閉括號行
			rows.push({ node, depth, isClose: true });
		}
	}

	/**
	 * 拖曳結束後，根據扁平列表中的新位置計算新的父節點和插入索引。
	 *
	 * 規則：
	 * - 看插入位置的前一個非 close 行：
	 *   - 如果前一行是展開的容器 → 成為該容器的第一個子項
	 *   - 否則 → 成為前一行節點的兄弟（同一個父節點），插在它後面
	 * - 如果插入到最前面 → 成為 root 的第一個子項
	 */
	function resolveDropTarget(
		list: FlatRow[],
		movedRow: FlatRow,
		newIndex: number,
		hiddenIds?: Set<string>,
	): { parentId: string; childIndex: number } | null {
		const root = tree.root.value;
		if (!root) return null;

		// 被移動的節點
		const movedNode = movedRow.node;

		// 往前找到第一個非自身、非隱藏的行
		let prev: FlatRow | null = null;
		for (let i = newIndex - 1; i >= 0; i--) {
			const row = list[i];
			if (row.node.id === movedNode.id) continue;
			if (hiddenIds?.has(row.isClose ? `close-${row.node.id}` : row.node.id)) continue;
			prev = row;
			break;
		}

		if (!prev) {
			// 插入到最前面 → root 的第一個子項
			return { parentId: root.id, childIndex: 0 };
		}

		if (prev.isClose) {
			// 前一行是容器的 close 行 → 和該容器同級（插在它後面）
			const closedNode = prev.node;
			const parentId = closedNode.parentId;
			if (!parentId) {
				return { parentId: root.id, childIndex: root.children.indexOf(closedNode) + 1 };
			}
			const parent = tree.nodeMap.get(parentId);
			if (!parent) return null;
			return { parentId, childIndex: parent.children.indexOf(closedNode) + 1 };
		}

		const prevNode = prev.node;
		const prevIsContainer = prevNode.type === "object" || prevNode.type === "array";

		if (prevIsContainer && !prevNode.collapsed) {
			// 前一行是展開的容器 header → 成為它的第一個子項
			return { parentId: prevNode.id, childIndex: 0 };
		}

		// 否則和 prev 同級
		const parentId = prevNode.parentId;
		if (!parentId) {
			// prev 是 root → 成為 root 的子項
			return { parentId: root.id, childIndex: root.children.indexOf(prevNode) + 1 };
		}

		const parent = tree.nodeMap.get(parentId);
		if (!parent) return null;

		const prevIndex = parent.children.indexOf(prevNode);
		return { parentId, childIndex: prevIndex + 1 };
	}

	return {
		flatList,
		resolveDropTarget,
	};
}

export type UseFlatList = ReturnType<typeof useFlatList>;
