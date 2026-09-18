// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach,beforeEach,expect,test,vi} from "vitest";

const clientApi=vi.hoisted(()=>({
 createPlaylist:vi.fn(),
 countDisplay:vi.fn(),
 saveFavourite:vi.fn()
}));
const analytics=vi.hoisted(()=>({track:vi.fn()}));

vi.mock("../../src/client/api.js",()=>clientApi);
vi.mock("../../src/client/analytics.js",()=>analytics);

import {Slideshow} from "../../src/client/App.js";

const welcomeCopy={eyebrow:"A little story",title:"Welcome",body:"Family memories."};
const playlist={
 playlistId:"playlist",
 photoDurationMs:600_000,
 items:[
  {id:"first",type:"IMAGE" as const,durationMs:null,ageLabel:"One month",impressionToken:"first-token",mediaUrl:"/api/assets/first/media",thumbnailUrl:"/api/assets/first/thumbnail"},
  {id:"second",type:"IMAGE" as const,durationMs:null,ageLabel:"Two months",impressionToken:"second-token",mediaUrl:"/api/assets/second/media",thumbnailUrl:"/api/assets/second/thumbnail"}
 ]
};

beforeEach(()=>{
 clientApi.createPlaylist.mockResolvedValue(playlist);
 clientApi.countDisplay.mockResolvedValue({counted:true});
 clientApi.saveFavourite.mockResolvedValue({saved:true,created:true});
 vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
});

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks()});

async function begin(){
 const user=userEvent.setup();
 render(<Slideshow welcomeCopy={welcomeCopy}/>);
 await user.click(screen.getByRole("button",{name:"Begin the journey"}));
 await waitFor(()=>expect(document.querySelector<HTMLImageElement>(".media-original")?.getAttribute("src")).toBe("/api/assets/first/media"));
 return document.querySelector<HTMLElement>("main.stage")!;
}

test("a qualifying touch swipe moves to the next memory once",async()=>{
 const stage=await begin();
 fireEvent.pointerDown(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:140,clientY:40});
 fireEvent.pointerUp(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:70,clientY:45});
 fireEvent.click(stage);
 expect(document.querySelector<HTMLImageElement>(".media-original")?.getAttribute("src")).toBe("/api/assets/second/media");
});

test("a touch starting on a control only performs the button action",async()=>{
 await begin();
 const next=screen.getByRole("button",{name:"Next"});
 fireEvent.pointerDown(next,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:140,clientY:40});
 fireEvent.pointerUp(next,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:70,clientY:45});
 fireEvent.click(next);
 expect(document.querySelector<HTMLImageElement>(".media-original")?.getAttribute("src")).toBe("/api/assets/second/media");
});

test("a cancelled touch does not navigate",async()=>{
 const stage=await begin();
 fireEvent.pointerDown(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:140,clientY:40});
 fireEvent.pointerCancel(stage,{pointerId:1,pointerType:"touch",isPrimary:true});
 fireEvent.pointerUp(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:70,clientY:45});
 expect(document.querySelector<HTMLImageElement>(".media-original")?.getAttribute("src")).toBe("/api/assets/first/media");
});

test("a second touch cancels navigation",async()=>{
 const stage=await begin();
 fireEvent.pointerDown(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:140,clientY:40});
 fireEvent.pointerDown(stage,{pointerId:2,pointerType:"touch",isPrimary:false,clientX:120,clientY:40});
 fireEvent.pointerUp(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:70,clientY:45});
 expect(document.querySelector<HTMLImageElement>(".media-original")?.getAttribute("src")).toBe("/api/assets/first/media");
});

test("a mouse drag keeps desktop navigation unchanged",async()=>{
 const stage=await begin();
 fireEvent.pointerDown(stage,{pointerId:1,pointerType:"mouse",isPrimary:true,clientX:140,clientY:40});
 fireEvent.pointerUp(stage,{pointerId:1,pointerType:"mouse",isPrimary:true,clientX:70,clientY:45});
 expect(document.querySelector<HTMLImageElement>(".media-original")?.getAttribute("src")).toBe("/api/assets/first/media");
});

function tap(stage:HTMLElement,x=100){
 fireEvent.pointerDown(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:x,clientY:40});
 fireEvent.pointerUp(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:x,clientY:40});
}
test("double-tapping saves the current moment without advancing",async()=>{
 const stage=await begin();tap(stage);tap(stage);
 await waitFor(()=>expect(clientApi.saveFavourite).toHaveBeenCalledExactlyOnceWith("first"));
 expect(document.querySelector<HTMLImageElement>(".media-original")?.getAttribute("src")).toBe("/api/assets/first/media");
});
test("swiping between taps does not save the next moment",async()=>{
 const stage=await begin();tap(stage);
 fireEvent.pointerDown(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:140,clientY:40});
 fireEvent.pointerUp(stage,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:70,clientY:45});
 tap(stage);
 expect(clientApi.saveFavourite).not.toHaveBeenCalled();
});
test("taps on controls do not count towards a favourite gesture",async()=>{
 const stage=await begin();tap(stage);
 const pause=screen.getByRole("button",{name:"Pause"});
 fireEvent.pointerDown(pause,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:100,clientY:40});
 fireEvent.pointerUp(pause,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:100,clientY:40});
 tap(stage);
 expect(clientApi.saveFavourite).not.toHaveBeenCalled();
});
