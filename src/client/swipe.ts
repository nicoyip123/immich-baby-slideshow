export type SwipePoint={x:number;y:number};
export type SwipeDirection=-1|0|1;

export function swipeDirection(start:SwipePoint,end:SwipePoint,minimumDistance=50):SwipeDirection{
 const horizontal=end.x-start.x;
 const vertical=end.y-start.y;
 if(Math.abs(horizontal)<minimumDistance||Math.abs(horizontal)<=Math.abs(vertical))return 0;
 return horizontal<0?1:-1;
}
