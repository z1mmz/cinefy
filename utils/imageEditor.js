export function imageDataFromMat(mat) {
    // converts the mat type to cv.CV_8U
    const img = new cv.Mat()
    mat.convertTo(img, cv.CV_8U,)
  
    // converts the img type to cv.CV_8UC4
    switch (img.type()) {
      case cv.CV_8UC1:
        cv.cvtColor(img, img, cv.COLOR_GRAY2RGBA)
        break
      case cv.CV_8UC3:
        cv.cvtColor(img, img, cv.COLOR_RGB2RGBA)
        break
      case cv.CV_8UC4:
        break
      default:
        throw new Error(
          'Bad number of channels (Source image must have 1, 3 or 4 channels)'
        )
    }
    const clampedArray = new ImageData(
      new Uint8ClampedArray(img.data),
      img.cols,
      img.rows
    )
    img.delete()
    return clampedArray
  }
