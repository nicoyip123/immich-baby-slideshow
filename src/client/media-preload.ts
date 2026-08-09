export interface PreloadItem {
 type:"IMAGE"|"VIDEO";
 mediaUrl:string;
 thumbnailUrl:string;
}

interface PreloadResource {
 src:string;
 removeAttribute(name:string):void;
}

interface VideoPreloadResource extends PreloadResource {
 preload:string;
 load():void;
}

export interface MediaPreloadFactory {
 createImage():PreloadResource;
 createVideo():VideoPreloadResource;
}

const browserFactory:MediaPreloadFactory={
 createImage:()=>new Image(),
 createVideo:()=>document.createElement("video")
};

export function preloadMediaItem(
 item:PreloadItem,
 factory:MediaPreloadFactory=browserFactory
):()=>void{
 if(item.type==="IMAGE"){
  const image=factory.createImage();
  image.src=item.mediaUrl;
  let active=true;
  return ()=>{
   if(!active)return;
   active=false;
   image.removeAttribute("src");
  };
 }

 const video=factory.createVideo();
 video.preload="metadata";
 video.src=item.mediaUrl;
 video.load();
 let active=true;
 return ()=>{
  if(!active)return;
  active=false;
  video.removeAttribute("src");
  video.load();
 };
}
