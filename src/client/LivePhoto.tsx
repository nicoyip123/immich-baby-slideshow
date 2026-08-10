import {useState} from "react";
import {ProgressiveImage} from "./ProgressiveImage.js";

interface LivePhotoItem{id:string;mediaUrl:string;thumbnailUrl:string}

export function LivePhoto({item,motionUrl}:{item:LivePhotoItem;motionUrl:string}){
 const [done,setDone]=useState(false);
 return <div className="media-stack">
  <ProgressiveImage item={item}/>
  <video
   className={`media media-motion${done?" media-motion-done":""}`}
   src={motionUrl}
   poster={item.thumbnailUrl}
   muted
   autoPlay
   playsInline
   preload="auto"
   onEnded={()=>setDone(true)}
   onError={()=>setDone(true)}
  />
 </div>;
}
