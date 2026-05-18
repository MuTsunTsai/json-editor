<template>
	<nav class="navbar navbar-dark bg-body-tertiary border-bottom px-3">
		<span class="navbar-brand mb-0 h1">JSON 編輯器</span>
		<div class="d-flex gap-2 align-items-center">
			<button
				class="btn btn-sm btn-outline-light"
				:disabled="!canUndo"
				title="復原 (Ctrl+Z)"
				@click="$emit('undo')"
			>
				復原
			</button>
			<button
				class="btn btn-sm btn-outline-light"
				:disabled="!canRedo"
				title="重做 (Ctrl+Y)"
				@click="$emit('redo')"
			>
				重做
			</button>
			<button class="btn btn-sm btn-outline-light" :disabled="!hasData" @click="$emit('copy')">
				複製
			</button>
			<button class="btn btn-sm btn-outline-light" @click="$emit('paste')">
				貼上
			</button>
			<span v-if="fileName" class="text-muted small me-2">{{ fileName }}</span>
			<button class="btn btn-sm btn-outline-light" @click="$emit('open')">
				開啟
			</button>
			<button class="btn btn-sm btn-outline-light" :disabled="!hasData" @click="$emit('save')">
				儲存
			</button>
			<button class="btn btn-sm btn-outline-light" :disabled="!hasData" @click="$emit('save-as')">
				另存新檔
			</button>
		</div>
	</nav>
</template>

<script setup lang="ts">
	defineProps<{
		fileName: string;
		hasData: boolean;
		canUndo: boolean;
		canRedo: boolean;
	}>();

	defineEmits<{
		open: [];
		save: [];
		"save-as": [];
		copy: [];
		paste: [];
		undo: [];
		redo: [];
	}>();
</script>
