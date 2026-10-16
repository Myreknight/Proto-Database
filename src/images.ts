// Shrinks an uploaded image to a small PNG data URL (transparency kept), so a
// logo doesn't bloat the show file or browser storage.
export async function imageToDataUrl(file: File, maxSize = 512): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // SVGs without a width/height report 0; draw those at the max size.
    const w = img.naturalWidth || maxSize
    const h = img.naturalHeight || maxSize
    const scale = Math.min(1, maxSize / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}
