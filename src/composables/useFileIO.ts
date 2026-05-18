import { ref } from "vue";

export function useFileIO() {
	const fileHandle = ref<FileSystemFileHandle | null>(null);
	const fileName = ref("");

	async function openFile(): Promise<string> {
		const [handle] = await window.showOpenFilePicker({
			types: [{
				description: "JSON Files",
				accept: { "application/json": [".json"] },
			}],
			multiple: false,
		});

		fileHandle.value = handle;
		fileName.value = handle.name;

		const file = await handle.getFile();
		return await file.text();
	}

	async function saveFile(content: string) {
		if (!fileHandle.value) {
			return await saveFileAs(content);
		}

		const writable = await fileHandle.value.createWritable();
		await writable.write(content);
		await writable.close();
	}

	async function saveFileAs(content: string) {
		const handle = await window.showSaveFilePicker({
			types: [{
				description: "JSON Files",
				accept: { "application/json": [".json"] },
			}],
			suggestedName: fileName.value || "data.json",
		});

		fileHandle.value = handle;
		fileName.value = handle.name;

		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
	}

	return {
		fileHandle,
		fileName,
		openFile,
		saveFile,
		saveFileAs,
	};
}

export type UseFileIO = ReturnType<typeof useFileIO>;
