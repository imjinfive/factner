export const UPLOAD_LIMIT = 1_572_864;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function decode(file) {
 if (typeof createImageBitmap === 'function') return createImageBitmap(file);
 const url = URL.createObjectURL(file);
 try {
  return await new Promise((resolve, reject) => {
   const image = new Image();
   image.onload = () => resolve(image);
   image.onerror = () => reject(new Error('사진을 읽지 못했습니다. JPG, PNG 또는 WebP 파일로 다시 저장해주세요.'));
   image.src = url;
  });
 } finally { URL.revokeObjectURL(url); }
}

// Photos are reference material. PDFs and files already under the limit stay intact.
export async function prepareUpload(file) {
 if (!file || ![...PHOTO_TYPES, 'application/pdf'].includes(file.type)) throw new Error('JPG, PNG, WebP 사진 또는 PDF 파일을 선택해주세요.');
 if (file.size <= UPLOAD_LIMIT) return file;
 if (file.type === 'application/pdf') throw new Error('PDF 원본은 자동 압축하지 않습니다. 1.5MB 이하로 저장하거나 담당자에게 원본 전달을 요청해주세요.');
 if (file.size > 30 * 1024 * 1024) throw new Error('자동 압축할 사진은 30MB 이하로 선택해주세요.');
 let source;
 try {
  source = await decode(file);
  if (!source.width || !source.height || source.width * source.height > 80_000_000) throw new Error('사진 크기가 너무 큽니다. 해상도를 줄여 다시 선택해주세요.');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이 브라우저에서 사진 압축을 사용할 수 없습니다.');
  // WebP retains transparency; JPEG stays JPEG. Unsupported WebP falls back to PNG.
  const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const initialScale = Math.min(1, 2400 / Math.max(source.width, source.height));
  for (let step = 0; step < 6; step++) {
   const scale = initialScale * 0.78 ** step;
   canvas.width = Math.max(1, Math.round(source.width * scale));
   canvas.height = Math.max(1, Math.round(source.height * scale));
   context.drawImage(source, 0, 0, canvas.width, canvas.height);
   const blob = await new Promise(resolve => canvas.toBlob(resolve, type, Math.max(0.65, 0.88 - step * 0.05)));
   if (blob && blob.size <= UPLOAD_LIMIT) {
    const extension = {'image/jpeg':'jpg', 'image/webp':'webp', 'image/png':'png'}[blob.type];
    if (!extension) throw new Error('사진을 지원하는 형식으로 변환하지 못했습니다.');
    const name = `${(file.name || 'photo').replace(/\.[^.]+$/, '')}-compressed.${extension}`;
    return new File([blob], name, {type:blob.type, lastModified:file.lastModified || Date.now()});
   }
  }
  throw new Error('사진을 1.5MB 이하로 압축하지 못했습니다. 사진 크기를 줄여 다시 선택해주세요.');
 } catch (error) {
  throw new Error(error?.message || '사진을 읽지 못했습니다. 다른 사진을 선택해주세요.');
 } finally { source?.close?.(); }
}
