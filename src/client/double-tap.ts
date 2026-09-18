type PointerPoint={pointerId:number;x:number;y:number};
const TAP_DURATION_MS=350;
const DOUBLE_TAP_GAP_MS=350;
const TAP_DISTANCE_PX=24;
const DRAG_DISTANCE_PX=12;
const distance=(a:PointerPoint,b:PointerPoint)=>Math.hypot(a.x-b.x,a.y-b.y);

export function createDoubleTapRecognizer(){
 let start:(PointerPoint&{time:number})|null=null;
 let previous:(PointerPoint&{time:number;assetId:string})|null=null;
 const cancel=()=>{start=null;previous=null};
 return {
  cancel,
  down(point:PointerPoint,time:number){
   if(start){cancel();return}
   start={...point,time};
  },
  move(point:PointerPoint){if(start&&(start.pointerId!==point.pointerId||distance(start,point)>DRAG_DISTANCE_PX))cancel()},
  up(point:PointerPoint,time:number,assetId:string){
   const initial=start;start=null;
   if(!initial||initial.pointerId!==point.pointerId||time-initial.time>TAP_DURATION_MS||distance(initial,point)>DRAG_DISTANCE_PX){cancel();return false}
   const matched=previous!==null&&previous.assetId===assetId&&time-previous.time<=DOUBLE_TAP_GAP_MS&&distance(previous,point)<=TAP_DISTANCE_PX;
   previous=matched?null:{...point,time,assetId};
   return matched;
  }
 };
}
