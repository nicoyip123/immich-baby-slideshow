import {describe,expect,it} from "vitest";
import {swipeDirection} from "../../src/client/swipe.js";

describe("swipeDirection",()=>{
 it("moves forward for a qualifying left swipe",()=>expect(swipeDirection({x:140,y:40},{x:70,y:45})).toBe(1));
 it("moves backward for a qualifying right swipe",()=>expect(swipeDirection({x:40,y:40},{x:100,y:44})).toBe(-1));
 it("rejects movement below the 50 pixel threshold",()=>expect(swipeDirection({x:100,y:20},{x:51,y:20})).toBe(0));
 it("rejects movement that is more vertical than horizontal",()=>expect(swipeDirection({x:100,y:20},{x:40,y:100})).toBe(0));
});
