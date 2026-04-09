import Head from 'next/head'
import styles from '../styles/Home.module.css'
import { useRef, useState, useEffect } from 'react'

const DEFAULT_PARAMS = {
  threshold:   0.85,  // luma level where halation begins (0.7–0.99)
  knee:        0.15,  // smoothstep width above threshold
  intensity:   0.50,  // overall halation strength
  tightSigma:  0.50,  // core glow radius (% of image width)
  wideSigma:   2.50,  // scatter tail radius (% of image width)
  tightWeight: 0.80,  // contribution of tight (core) Gaussian
  wideWeight:  0.30,  // contribution of wide (tail) Gaussian
};

export default function Home() {
  const canvasBefore = useRef();
  const canvasAfter  = useRef();
  const workerRef    = useRef(null);
  const debounceRef  = useRef(null);
  const imgDataRef   = useRef(null);   // current full ImageData kept for re-processing

  const [params, setParams]           = useState(DEFAULT_PARAMS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasResult, setHasResult]     = useState(false);

  // Create the worker once; reuse it for every image / slider change
  useEffect(() => {
    const worker = new Worker('/halationWorker.js');
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'result') {
        const canvas = canvasAfter.current;
        canvas.width  = msg.imageData.width;
        canvas.height = msg.imageData.height;
        canvas.getContext('2d').putImageData(msg.imageData, 0, 0);
        setIsProcessing(false);
        setHasResult(true);
      } else if (msg.type === 'error') {
        console.error('Halation worker error:', msg.message);
        setIsProcessing(false);
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  function runHalation(imgData, p) {
    if (!imgData || !workerRef.current) return;
    setIsProcessing(true);
    workerRef.current.postMessage({ imageData: imgData, params: p });
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      console.error('Could not decode image');
      return;
    }

    // Scale down to at most 1200px wide (preserving aspect ratio)
    const scale = Math.min(1, 1200 / bitmap.width);
    const w = Math.round(bitmap.width  * scale);
    const h = Math.round(bitmap.height * scale);

    // Draw original to the before-canvas and extract ImageData for the worker
    const before = canvasBefore.current;
    before.width  = w;
    before.height = h;
    const ctx = before.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // Size the after-canvas now so it doesn't shift when the result arrives
    canvasAfter.current.width  = w;
    canvasAfter.current.height = h;

    const imgData = ctx.getImageData(0, 0, w, h);
    imgDataRef.current = imgData;
    setHasResult(false);
    runHalation(imgData, params);
  }

  function handleParamChange(key, value) {
    setParams(prev => {
      const next = { ...prev, [key]: value };
      // Debounce slider reprocessing — avoids flooding the worker
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        runHalation(imgDataRef.current, next);
      }, 80);
      return next;
    });
  }

  function handleDownload() {
    const link = document.createElement('a');
    link.download = 'cinestill-halation.png';
    link.href = canvasAfter.current.toDataURL('image/png');
    link.click();
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Halation</title>
        <meta name="description" content="halation simulator" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.appTitle}>Halation</h1>
        <p className={styles.subtitle}>halation simulator</p>

        <label className={styles.fileLabel}>
          Choose image
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            className={styles.fileInput}
          />
        </label>

        <div className={styles.beforeAfterContainer}>
          <div className={styles.canvasWrapper}>
            <span className={styles.canvasLabel}>Original</span>
            <canvas className={styles.resultCanvas} ref={canvasBefore} />
          </div>
          <div className={styles.canvasWrapper}>
            <span className={styles.canvasLabel}>
              {isProcessing ? 'Processing…' : 'Halation'}
            </span>
            <canvas className={styles.resultCanvas} ref={canvasAfter} />
          </div>
        </div>

        <div className={styles.controls}>
          <p className={styles.controlsTitle}>Parameters</p>

          <SliderRow
            label="Highlight Threshold"
            hint="Luminance level where halation begins"
            min={0.70} max={0.99} step={0.01}
            value={params.threshold}
            onChange={v => handleParamChange('threshold', v)}
          />
          <SliderRow
            label="Knee Width"
            hint="Softness of the threshold transition"
            min={0.05} max={0.30} step={0.01}
            value={params.knee}
            onChange={v => handleParamChange('knee', v)}
          />
          <SliderRow
            label="Intensity"
            hint="Overall halation strength"
            min={0} max={2} step={0.05}
            value={params.intensity}
            onChange={v => handleParamChange('intensity', v)}
          />
          <SliderRow
            label="Glow Radius %"
            hint="Core glow size as % of image width"
            min={0.1} max={1.0} step={0.05}
            value={params.tightSigma}
            onChange={v => handleParamChange('tightSigma', v)}
          />
          <SliderRow
            label="Scatter Radius %"
            hint="Wide scatter tail size as % of image width"
            min={0.5} max={5.0} step={0.1}
            value={params.wideSigma}
            onChange={v => handleParamChange('wideSigma', v)}
          />
          <SliderRow
            label="Glow Weight"
            hint="Contribution of the tight core Gaussian"
            min={0} max={1} step={0.05}
            value={params.tightWeight}
            onChange={v => handleParamChange('tightWeight', v)}
          />
          <SliderRow
            label="Scatter Weight"
            hint="Contribution of the wide tail Gaussian"
            min={0} max={1} step={0.05}
            value={params.wideWeight}
            onChange={v => handleParamChange('wideWeight', v)}
          />
        </div>

        {hasResult && (
          <button className={styles.downloadBtn} onClick={handleDownload}>
            Download PNG
          </button>
        )}
      </main>
    </div>
  );
}

function SliderRow({ label, hint, min, max, step, value, onChange }) {
  return (
    <div className={styles.sliderRow} title={hint}>
      <span className={styles.sliderLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className={styles.slider}
      />
      <span className={styles.sliderValue}>{value.toFixed(2)}</span>
    </div>
  );
}
