import {expect,test,vi} from "vitest";
import {preloadMediaItem,type MediaPreloadFactory} from "../../src/client/media-preload.js";

function factoryFakes(){
 const image={src:"",removeAttribute:vi.fn()};
 const video={src:"",preload:"",load:vi.fn(),removeAttribute:vi.fn()};
 const factory:MediaPreloadFactory={
  createImage:vi.fn(()=>image),
  createVideo:vi.fn(()=>video)
 };
 return {factory,image,video};
}

test("preloads only an image original and removes its source once",()=>{
 const {factory,image,video}=factoryFakes();
 const cleanup=preloadMediaItem(
  {type:"IMAGE",mediaUrl:"/full",thumbnailUrl:"/thumb"},
  factory
 );

 expect(factory.createImage).toHaveBeenCalledOnce();
 expect(factory.createVideo).not.toHaveBeenCalled();
 expect(image.src).toBe("/full");
 expect(image.src).not.toBe("/thumb");
 expect(video.load).not.toHaveBeenCalled();

 cleanup();
 cleanup();

 expect(image.removeAttribute).toHaveBeenCalledOnce();
 expect(image.removeAttribute).toHaveBeenCalledWith("src");
});

test("preloads only video metadata and detaches it once",()=>{
 const {factory,image,video}=factoryFakes();
 const cleanup=preloadMediaItem(
  {type:"VIDEO",mediaUrl:"/video",thumbnailUrl:"/poster"},
  factory
 );

 expect(factory.createVideo).toHaveBeenCalledOnce();
 expect(factory.createImage).not.toHaveBeenCalled();
 expect(video.src).toBe("/video");
 expect(video.src).not.toBe("/poster");
 expect(video.preload).toBe("metadata");
 expect(video.preload).not.toBe("auto");
 expect(video.load).toHaveBeenCalledOnce();
 expect(image.src).toBe("");

 cleanup();
 cleanup();

 expect(video.removeAttribute).toHaveBeenCalledOnce();
 expect(video.removeAttribute).toHaveBeenCalledWith("src");
 expect(video.load).toHaveBeenCalledTimes(2);
});
