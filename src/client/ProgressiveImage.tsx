import {useState} from "react";

interface ProgressiveImageItem {
 id:string;
 mediaUrl:string;
 thumbnailUrl:string;
}

export function ProgressiveImage({item}:{item:ProgressiveImageItem}){
 const [loaded,setLoaded]=useState(false);
 return <div className="media-stack">
  <img
   className={`media media-preview${loaded?" media-preview-hidden":""}`}
   src={item.thumbnailUrl}
   alt=""
   aria-hidden="true"
  />
  <img
   className={`media kenburns media-original${loaded?" media-original-loaded":""}`}
   src={item.mediaUrl}
   alt=""
   onLoad={()=>setLoaded(true)}
  />
 </div>;
}
