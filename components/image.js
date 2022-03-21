import Head from 'next/head'
import Image from 'next/image'


export default function Image(props) {
    const image = props.image
  return (
    <div className={styles.container}>
        <canvas></canvas>
 
    </div>
  )
}
