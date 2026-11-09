export async function imageQuality(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file)

  try {
    const image = new Image()

    image.src = url
    await image.decode()

    const canvas = document.createElement('canvas'),
      ratio = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight))

    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))

    const context = canvas.getContext('2d', { willReadFrequently: true })

    if (!context) return []
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data,
      gray = new Float32Array(canvas.width * canvas.height)
    let sum = 0,
      dark = 0,
      edges = 0

    for (let i = 0; i < gray.length; i++) {
      const n = (data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]!) / 3

      gray[i] = n
      sum += n
      if (n < 90) dark++
    }
    for (let y = 1; y < canvas.height - 1; y++)
      for (let x = 1; x < canvas.width - 1; x++) {
        const i = y * canvas.width + x

        edges += Math.abs(
          4 * gray[i]! -
            gray[i - 1]! -
            gray[i + 1]! -
            gray[i - canvas.width]! -
            gray[i + canvas.width]!,
        )
      }

    const warnings: string[] = []

    if (image.naturalWidth < 250 || image.naturalHeight < 80)
      warnings.push('图片分辨率偏低，建议使用更清晰的原图')
    if (sum / gray.length < 85 || dark / gray.length > 0.65)
      warnings.push('图片偏暗，建议补光后重拍')
    if (edges / gray.length < 1.2) warnings.push('图片可能模糊或文字过浅，请检查公式是否清晰')
    if (dark / gray.length > 0.002 && dark / gray.length < 0.4) {
      const score = (angle: number) => {
        const rows = new Float64Array(canvas.height),
          rad = (angle * Math.PI) / 180,
          cos = Math.cos(rad),
          sin = Math.sin(rad)
        let count = 0

        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++)
            if (gray[y * canvas.width + x]! < 100) {
              const target = Math.round(
                (y - canvas.height / 2) * cos + (x - canvas.width / 2) * sin + canvas.height / 2,
              )

              if (target >= 0 && target < rows.length) {
                rows[target] = rows[target]! + 1
                count++
              }
            }
        return rows.reduce((n, row) => n + row * row, 0) / Math.max(1, count * count)
      }
      const base = score(0),
        tilted = Math.max(score(-8), score(8))

      if (tilted > base * 1.4) warnings.push('文字可能倾斜，建议摆正后重新拍摄')
    }
    return warnings
  } finally {
    URL.revokeObjectURL(url)
  }
}
