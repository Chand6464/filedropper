export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatCode(code: string): string {
  if (!code) return '';
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length > 3) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}`;
  }
  return clean;
}

export function getFileCategory(mimeType: string, filename: string): 'image' | 'pdf' | 'text' | 'audio' | 'video' | 'other' {
  const lowerMime = (mimeType || '').toLowerCase();
  const lowerName = (filename || '').toLowerCase();

  if (lowerMime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(lowerName)) {
    return 'image';
  }
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    lowerMime.startsWith('text/') ||
    lowerMime.includes('json') ||
    lowerMime.includes('javascript') ||
    /\.(txt|md|csv|json|js|ts|py|html|css|xml|log)$/i.test(lowerName)
  ) {
    return 'text';
  }
  if (lowerMime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lowerName)) {
    return 'audio';
  }
  if (lowerMime.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(lowerName)) {
    return 'video';
  }
  return 'other';
}
