export async function createProfileThumbnail(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('File size exceeds the 5MB limit.');

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not read this image. Please choose another file.'));
      image.src = url;
    });
    const scale = Math.min(1, 256 / image.naturalWidth, 256 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image resizing is not supported on this device.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
    if (!thumbnail.startsWith('data:image/jpeg') || thumbnail.length >= 100 * 1024) {
      throw new Error('Could not create a small profile photo. Please choose another image.');
    }
    return thumbnail;
  } finally {
    URL.revokeObjectURL(url);
  }
}
