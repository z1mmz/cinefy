function imageDataFromMat(mat) {
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

onmessage = function(e) {
    importScripts("https://docs.opencv.org/master/opencv.js")
    console.log('Message received from main script');
    console.log(e)
    postMessage(["Loading...",""])
    cv["onRuntimeInitialized"] = () => {                                             
        var mat = cv.matFromImageData(e.data)
        var overLay = new cv.Mat();
        let ksize = new cv.Size(0, 0);
        cv.cvtColor(mat,overLay, cv.COLOR_RGBA2GRAY);
        cv.threshold(overLay,overLay,245,255,cv.THRESH_BINARY);
        cv.GaussianBlur(overLay,overLay,ksize,10,10,cv.BORDER_DEFAULT)
    
        cv.threshold(overLay,overLay,10,255,cv.THRESH_BINARY);
        cv.GaussianBlur(overLay,overLay,ksize,3,3,cv.BORDER_DEFAULT)
    
        cv.cvtColor(overLay,overLay,cv.COLOR_GRAY2RGBA)
        let row = 0 , col = 0
        console.log(overLay.channels())
        for(let r = 0 ; r < overLay.rows; r++){
        // console.log(r - overLay.rows)
        postMessage([(r/overLay.rows*100).toPrecision(3),""])
        for(let c = 0; c< overLay.cols; c++){
            row = r, col = c;
            
            if (overLay.isContinuous() ) {
                overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()]*1;
                overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels() +1 ] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()+1]*0.1;
                overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels() +2 ] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()+2]*0.1;
                // overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels() +3 ] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()+3]*0.5;
                // overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels() +4 ] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()+4]*0;
            }
        }

    }
        cv.addWeighted(mat, 1, overLay, 0.5, 1, overLay);
        postMessage([100,imageDataFromMat(overLay)])
    };

  }