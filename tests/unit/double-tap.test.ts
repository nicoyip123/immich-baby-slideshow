import {describe,expect,it} from "vitest";
import {createDoubleTapRecognizer} from "../../src/client/double-tap.js";
const pointer=(x=50,y=50,pointerId=1)=>({x,y,pointerId});
function tap(recognizer:ReturnType<typeof createDoubleTapRecognizer>,time:number,id="photo",x=50){recognizer.down(pointer(x),time);return recognizer.up(pointer(x),time+50,id)}
describe("favourite double taps",()=>{
 it("recognizes two nearby quick taps once",()=>{const r=createDoubleTapRecognizer();expect(tap(r,0)).toBe(false);expect(tap(r,200)).toBe(true);expect(tap(r,350)).toBe(false)});
 it("does not join taps across slides",()=>{const r=createDoubleTapRecognizer();tap(r,0,"first");expect(tap(r,200,"second")).toBe(false)});
 it("rejects slow, distant and long-press gestures",()=>{
  const r=createDoubleTapRecognizer();tap(r,0);expect(tap(r,1000)).toBe(false);expect(tap(r,1200,"photo",200)).toBe(false);
  r.down(pointer(200),1300);expect(r.up(pointer(200),2300,"photo")).toBe(false);
 });
 it("rejects a drag that returns to its starting position",()=>{
  const r=createDoubleTapRecognizer();tap(r,0);r.down(pointer(),150);r.move(pointer(90));expect(r.up(pointer(),200,"photo")).toBe(false);expect(tap(r,250)).toBe(false);
 });
 it("cancels after drags, pointer cancellation and multitouch",()=>{
  const r=createDoubleTapRecognizer();tap(r,0);r.down(pointer(),150);r.up(pointer(70),200,"photo");expect(tap(r,250)).toBe(false);
  r.cancel();expect(tap(r,350)).toBe(false);
  r.down(pointer(),450);r.down(pointer(50,50,2),460);expect(r.up(pointer(),470,"photo")).toBe(false);expect(tap(r,550)).toBe(false);
 });
});
