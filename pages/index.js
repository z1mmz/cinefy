import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import Script from 'next/script'

import { useRef,useState } from 'react'
import { urlObjectKeys } from 'next/dist/shared/lib/utils'
import {imageDataFromMat } from '../utils/imageEditor'

export default function Home() {
  const img1 = useRef()
  const canvas0 = useRef()
  const canvas1 = useRef()
  const [cv ,setCV] = useState()
  const [progress ,setProgress] = useState(0)
 
  const loadImg = () => {
    console.log("yay")
  
  }
  const loadOpenCV = () => {
    console.log("OPEN CV LOADED")
    setCV(window.cv)
  }
  const fileChange = (e) =>{
    console.log(window)
    if(e.target.files.length>0){
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
  }    

  function handleImageLoad() {
    var worker = new Worker("/worker.js")
    var img=img1.current
    img2canvas(img,canvas1.current)
    img.className = ""
    var mat = cv.imread(img) 
    cv.imshow(canvas1.current, mat);   
    worker.postMessage(imageDataFromMat(mat))
    worker.onmessage = function(e) {

      setProgress(e.data[0])
      if(e.data[1] != ""){
        console.log(e.data[1])
        var result = cv.matFromImageData(e.data[1])  
        cv.imshow(canvas1.current, result);  
      }
    }
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
 
  } 

  return (
    <div className={styles.container}>
      <Script src="https://docs.opencv.org/master/opencv.js" onLoad={loadOpenCV} />
      <main className={styles.main}>
      <canvas className={styles.resultImage} ref={canvas0} id="canvasOutput" ></canvas>    
      <canvas className={styles.resultImage} ref={canvas1} id="canvasOutput" ></canvas>
        <h1 className={styles.title}> 
          {  progress!=0 ? <p>Progress: {progress}%</p>:""}
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
