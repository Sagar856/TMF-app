export interface ProfileCrop {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
}

export function validateProfilePhoto(file: File): void {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('File size exceeds the 5MB limit.');
}

export function drawProfileCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, crop: ProfileCrop): void {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) throw new Error('Could not read this image. Please choose another file.');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image editing is not supported on this device.');
  const side = canvas.width;
  const sideways = crop.rotation % 180 !== 0;
  const rotatedWidth = sideways ? height : width;
  const rotatedHeight = sideways ? width : height;
  const scale = Math.max(side / rotatedWidth, side / rotatedHeight) * crop.zoom;
  const offsetX = (rotatedWidth * scale - side) * (0.5 - crop.x / 100);
  const offsetY = (rotatedHeight * scale - side) * (0.5 - crop.y / 100);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, side, side);
  context.save();
  context.translate(side / 2 + offsetX, side / 2 + offsetY);
  context.rotate(crop.rotation * Math.PI / 180);
  context.drawImage(image, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
  context.restore();
}

export function createProfileThumbnail(image: HTMLImageElement, crop: ProfileCrop): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  drawProfileCrop(canvas, image, crop);
  const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
  if (!thumbnail.startsWith('data:image/jpeg') || thumbnail.length >= 100 * 1024) {
    throw new Error('Could not create a small profile photo. Please choose another image.');
  }
  return thumbnail;
}
