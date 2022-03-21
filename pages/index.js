import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import Script from 'next/script'
import { useRef,useState } from 'react'


export default function Home() {
  const img1 = useRef()
  const canvas1 = useRef()
  const [cv ,setCV] = useState()

  const loadImg = () => {
    console.log("yay")
  
  }
  const loadOpenCV = () => {
    console.log("OPEN CV LOADED")
    setCV(window.cv)
  }
  const fileChange = (e) =>{
    console.log(window)
    const file = e.target.files[0];     
    var fr = new FileReader();
    fr.readAsDataURL(file);
    var img = img1.current
    fr.onload = (evt) => {
            if( evt.target.readyState === FileReader.DONE) {
              img.src = evt.target.result;              
            }
    }
  }    


  function handleImageLoad() {
    var img=img1.current
    img2canvas(img,canvas1.current)
    img.className = ""
  }

  function img2canvas(img, canvas) {
    var ctx = canvas.getContext('2d')              
    var ratioImage = img.naturalWidth / img.naturalHeight;
    var widthAdj = 400 //canvas.width;
    var heightAdj = Math.ceil(widthAdj / ratioImage)

    canvas.width = widthAdj //(img.width/2);
    canvas.height =heightAdj // (img.height/2);

    ctx.width = widthAdj + 'px'   //(img.width/2) + 'px';
    ctx.height = heightAdj + 'px'  //(img.height/2) + 'px';
    ctx.drawImage(img, 0, 0, widthAdj, heightAdj);    
    testOpenCv()
  } 

  function testOpenCv() {
    var img = img1.current
    var mat = cv.imread(img)  
    var overLay = new cv.Mat();
    let ksize = new cv.Size(0, 0);
    cv.cvtColor(mat,overLay, cv.COLOR_RGBA2GRAY);
    cv.threshold(overLay,overLay,220,255,cv.THRESH_BINARY);
    cv.GaussianBlur(overLay,overLay,ksize,10,10,cv.BORDER_DEFAULT)
    cv.cvtColor(overLay,overLay,cv.COLOR_GRAY2RGBA)
    let bgrPlanes = new cv.MatVector();
    console.log(overLay.data)
    let row = 0 , col = 0
    console.log(overLay.channels())
    for(let r = 0 ; r < overLay.rows; r++){
      console.log(r - overLay.rows)
      for(let c = 0; c< overLay.cols; c++){
        row = r, col = c;
        
        if (overLay.isContinuous()) {
            overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()]*2;
            overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels() +1 ] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()+1]*0.2;
            overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels() +2 ] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()+2]*0.2;
            overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels() +3 ] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()+3]*0.5;
            // overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels() +4 ] = overLay.data[row * overLay.cols * overLay.channels() + col * overLay.channels()+4]*0;
        }
    }
  }
    cv.split(overLay, bgrPlanes);
    let r = bgrPlanes.get(2)
    console.log(r)
    cv.addWeighted(mat, 1, overLay, 0.5, .5, overLay);
    cv.imshow(canvas1.current, overLay);    
  }
  return (
    <div className={styles.container}>
      <Script src="https://docs.opencv.org/master/opencv.js" onLoad={loadOpenCV} />


      <main className={styles.main}>
      <canvas width="200" height="200" ref={canvas1} id="canvasOutput" ></canvas>
        <h1 className={styles.title}>
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>
        {cv ? <input onChange={fileChange} type="file" id="input"></input>:""}
      </main>

      <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <span className={styles.logo}>
            <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
          </span>
        </a>
      </footer>
      <img src="" alt="testimg" ref={img1} onLoad={handleImageLoad} style={{display:"none"}}/>
    </div>
  )
}
