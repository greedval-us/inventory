export const ATTACHMENT_KINDS = [
  { value: 'any', label: 'Любые файлы', extensions: ['*'] },
  { value: 'image', label: 'Фото и изображения', extensions: ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'svg', 'ico', 'dng', 'cr2', 'cr3', 'nef', 'arw'] },
  { value: 'document', label: 'Документы', extensions: ['pdf', 'doc', 'docx', 'docm', 'odt', 'rtf', 'txt', 'md', 'xls', 'xlsx', 'xlsm', 'ods', 'csv', 'ppt', 'pptx', 'odp'] },
  { value: 'archive', label: 'Архивы', extensions: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'cab'] },
  { value: 'audio', label: 'Аудио', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wma', 'aiff'] },
  { value: 'video', label: 'Видео', extensions: ['mp4', 'm4v', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'mpg', 'mpeg', 'm2ts', '3gp'] },
];

export function attachmentKind(value) {
  return ATTACHMENT_KINDS.find(kind => kind.value === value);
}

export function acceptsAttachment(kind, name) {
  if (typeof name !== 'string' || !name) return false;
  if (kind === 'any') return true;
  const dot = name.lastIndexOf('.');
  return dot > 0 && Boolean(attachmentKind(kind)?.extensions.includes(name.slice(dot + 1).toLowerCase()));
}
