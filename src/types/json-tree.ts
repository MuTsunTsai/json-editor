import type { InjectionKey, Ref } from "vue";
import type { UseJsonTree } from "../composables/useJsonTree";
import type { UseSelection } from "../composables/useSelection";

export type NodeType = "string" | "number" | "boolean" | "null" | "object" | "array";

export interface JsonTreeNode {
	id: string;
	key: string;
	type: NodeType;
	value: string | number | boolean | null;
	children: JsonTreeNode[];
	parentId: string | null;
	collapsed: boolean;
}

export const jsonTreeKey: InjectionKey<UseJsonTree> = Symbol("jsonTree");
export const selectionKey: InjectionKey<UseSelection> = Symbol("selection");
export const draggingNodeIdKey: InjectionKey<Ref<string | null>> = Symbol("draggingNodeId");
export const prepareDragKey: InjectionKey<(nodeId: string) => void> = Symbol("prepareDrag");
export const recordHistoryKey: InjectionKey<(mutation: (root: JsonTreeNode) => void) => void> = Symbol("recordHistory");
