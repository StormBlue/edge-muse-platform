/**
 * 参考图文件处理工具。
 *
 * 两个生成入口都支持点击、粘贴、拖拽添加参考图；这里统一做图片筛选和轻量压缩，
 * 避免不同页面对同一批文件产生不一致的上传行为。
 */

export function imageFilesFromFileList(input: FileList | File[] | null | undefined): File[] {
  return Array.from(input ?? []).filter(isImageFile);
}

export function imageFilesFromDataTransfer(input: DataTransfer | null | undefined): File[] {
  if (!input) return [];
  const files = imageFilesFromFileList(input.files);
  if (files.length) return files;

  const itemFiles = Array.from(input.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .filter(isImageFile);
  return uniqueFiles(itemFiles);
}

export async function prepareReferenceImageFiles(inputFiles: File[]) {
  const imageFiles = inputFiles.filter(isImageFile);
  return Promise.all(imageFiles.map(compressReferenceImage));
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function uniqueFiles(files: File[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 大图或超约 1.5MB 时压到长边 2048、jpeg 0.85。
 * 浏览器能力或解码失败时回传原文件，保证粘贴/拖拽流程不中断。
 */
async function compressReferenceImage(file: File): Promise<File> {
  if (typeof createImageBitmap === "undefined") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const maxEdge = Math.max(bitmap.width, bitmap.height);
  const needsCompression = file.size > 1.5 * 1024 * 1024 || maxEdge > 2048;
  if (!needsCompression) {
    bitmap.close();
    return file;
  }
  const scale = Math.min(1, 2048 / maxEdge);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}
