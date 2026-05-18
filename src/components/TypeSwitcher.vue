<template>
	<select
		class="form-select form-select-sm type-switcher"
		:value="type"
		@change="$emit('update:type', ($event.target as HTMLSelectElement).value as NodeType)"
		@focus="$emit('focus')"
		@blur="$emit('blur')"
		@mousedown.stop
	>
		<option value="string">string</option>
		<option value="number">number</option>
		<option value="boolean">boolean</option>
		<option value="null">null</option>
		<option value="object">object</option>
		<option value="array">array</option>
	</select>
</template>

<script setup lang="ts">
	import type { NodeType } from "../types/json-tree";

	defineProps<{
		type: NodeType;
	}>();

	defineEmits<{
		"update:type": [value: NodeType];
		focus: [];
		blur: [];
	}>();
</script>

<style scoped>
	.type-switcher {
		width: auto;
		display: inline-block;
		font-size: 11px;
		padding: 1px 2rem 1px 6px;
		margin-right: 0.5rem;
		height: 22px;
		vertical-align: middle;
	}
</style>
