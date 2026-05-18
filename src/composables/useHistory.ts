import { ref } from "vue";
import { Travels } from "travels";
import type { JsonTreeNode } from "../types/json-tree";
import type { UseJsonTree } from "./useJsonTree";

/**
 * 包覆 travels 套件，提供 mutation 認可、undo、redo 介面。
 *
 * 採用 mutable mode：travels 會把產生的 JSON Patches 直接 apply 到原始物件，
 * 不會替換 root.value 的物件參考——Vue 的 reactive proxy 因此能繼續追蹤。
 *
 * 重要：所有 mutation 必須透過 `record(fn)` 呼叫，且 `fn` 接收到的 root 是
 * mutative 的 draft proxy,**不是**原始 reactive 物件。所有對 tree 的修改
 * 必須走這個 draft,否則 mutative 偵測不到變更,patches 會是空的。
 */
export function useHistory(tree: UseJsonTree) {
	let travels: Travels<JsonTreeNode> | null = null;

	const canUndo = ref(false);
	const canRedo = ref(false);

	function syncCanFlags() {
		canUndo.value = !!travels && travels.canBack();
		canRedo.value = !!travels && travels.canForward();
	}

	/** 在 loadJson 之後呼叫,用當前 root 重建 travels 實例(清空歷史) */
	function init() {
		if (!tree.root.value) {
			travels = null;
			syncCanFlags();
			return;
		}
		travels = new Travels(tree.root.value, {
			mutable: true,
			maxHistory: 100,
		});
		syncCanFlags();
	}

	/**
	 * 把一次 mutation 包成單一歷史條目。
	 * mutation 接收的 root 是 mutative 的 draft——對它的修改才會被記錄成 patches。
	 */
	function record(mutation: (root: JsonTreeNode) => void) {
		if (!travels) return;
		travels.setState((draft) => {
			mutation(draft as JsonTreeNode);
		});
		tree.rebuildNodeMap();
		syncCanFlags();
	}

	function undo() {
		if (!travels || !travels.canBack()) return;
		travels.back();
		tree.rebuildNodeMap();
		syncCanFlags();
	}

	function redo() {
		if (!travels || !travels.canForward()) return;
		travels.forward();
		tree.rebuildNodeMap();
		syncCanFlags();
	}

	return { init, record, undo, redo, canUndo, canRedo };
}

export type UseHistory = ReturnType<typeof useHistory>;
