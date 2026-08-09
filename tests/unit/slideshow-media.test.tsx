// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach,beforeEach,describe,expect,test,vi} from "vitest";

const clientApi=vi.hoisted(()=>({
 createPlaylist:vi.fn(),
 countDisplay:vi.fn()
}));
const analytics=vi.hoisted(()=>({track:vi.fn()}));
const preload=vi.hoisted(()=>({preloadMediaItem:vi.fn()}));
const soundtrack=vi.hoisted(()=>({
 createSoundtrackMixer:vi.fn(),
 soundtrackLevel:vi.fn((type:"IMAGE"|"VIDEO"|undefined,muted:boolean)=>muted?0:type==="VIDEO" ? .15 : 1)
}));

vi.mock("../../src/client/api.js",()=>clientApi);
vi.mock("../../src/client/analytics.js",()=>analytics);
vi.mock("../../src/client/media-preload.js",()=>preload);
vi.mock("../../src/client/soundtrack.js",()=>soundtrack);

import {Slideshow} from "../../src/client/App.js";

const welcomeCopy={eyebrow:"A little story",title:"Welcome",body:"Family memories."};
const first={id:"photo",type:"IMAGE" as const,durationMs:null,ageLabel:"One month",impressionToken:"photo-token",mediaUrl:"/api/assets/photo/media",thumbnailUrl:"/api/assets/photo/thumbnail"};
const second={id:"clip",type:"VIDEO" as const,durationMs:12_000,ageLabel:"Two months",impressionToken:"clip-token",mediaUrl:"/api/assets/clip/media",thumbnailUrl:"/api/assets/clip/thumbnail"};
const playlist={playlistId:"playlist",photoDurationMs:600_000,items:[first,second]};

function deferred<T>(){
 let resolve!: (value:T)=>void;
 let reject!: (reason?:unknown)=>void;
 const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail});
 return {promise,resolve,reject};
}

function mixerHarness(){
 const mixer={start:vi.fn(()=>Promise.resolve()),setTarget:vi.fn(),dispose:vi.fn()};
 soundtrack.createSoundtrackMixer.mockReturnValue(mixer);
 return mixer;
}

beforeEach(()=>{
 clientApi.createPlaylist.mockResolvedValue(playlist);
 clientApi.countDisplay.mockResolvedValue({counted:true});
 preload.preloadMediaItem.mockImplementation(()=>vi.fn());
 vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
 vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
});

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks()});

async function begin(){
 const user=userEvent.setup();
 const view=render(<Slideshow welcomeCopy={welcomeCopy}/>);
 await user.click(screen.getByRole("button",{name:"Begin the journey"}));
 await screen.findByRole("button",{name:"Next"});
 return {user,...view};
}

describe("slideshow media integration",()=>{
 test("starts one persistent soundtrack synchronously before the playlist resolves",async()=>{
  const pending=deferred<typeof playlist>();
  clientApi.createPlaylist.mockReturnValue(pending.promise);
  const mixer=mixerHarness();
  render(<Slideshow welcomeCopy={welcomeCopy}/>);
  const welcomeAudio=document.querySelector<HTMLAudioElement>('audio[src="/api/soundtrack"]')!;

  expect(document.querySelectorAll("audio")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"Begin the journey"}));

  expect(soundtrack.createSoundtrackMixer).toHaveBeenCalledWith(welcomeAudio);
  expect(soundtrack.soundtrackLevel).toHaveBeenCalledWith(undefined,false);
  expect(mixer.setTarget).toHaveBeenCalledWith(1);
  expect(mixer.start).toHaveBeenCalledOnce();
  expect(clientApi.createPlaylist).toHaveBeenCalledOnce();
  expect(mixer.start.mock.invocationCallOrder[0]).toBeLessThan(clientApi.createPlaylist.mock.invocationCallOrder[0]);
  expect(screen.getByRole<HTMLButtonElement>("button",{name:"Loading memories…"}).disabled).toBe(true);

  await act(async()=>pending.resolve(playlist));

  expect(document.querySelectorAll("audio")).toHaveLength(1);
  expect(document.querySelector("audio")).toBe(welcomeAudio);
  expect(analytics.track).toHaveBeenCalledWith("slideshow_started");
 });

 test("serializes repeated Begin attempts into one startup operation",async()=>{
  const pending=deferred<typeof playlist>();
  clientApi.createPlaylist.mockReturnValue(pending.promise);
  const mixer=mixerHarness();
  const {unmount}=render(<Slideshow welcomeCopy={welcomeCopy}/>);
  const welcomeAudio=document.querySelector<HTMLAudioElement>('audio[src="/api/soundtrack"]')!;
  const beginButton=screen.getByRole("button",{name:"Begin the journey"});

  fireEvent.click(beginButton);
  fireEvent.click(beginButton);

  expect(soundtrack.createSoundtrackMixer).toHaveBeenCalledOnce();
  expect(soundtrack.createSoundtrackMixer).toHaveBeenCalledWith(welcomeAudio);
  expect(mixer.start).toHaveBeenCalledOnce();
  expect(clientApi.createPlaylist).toHaveBeenCalledOnce();
  expect(screen.getByRole("button",{name:"Loading memories…"}).hasAttribute("disabled")).toBe(true);

  await act(async()=>pending.resolve(playlist));
  expect(analytics.track).toHaveBeenCalledTimes(1);
  unmount();

  expect(mixer.dispose).toHaveBeenCalledOnce();
 });

 test("handles startup failure and retries with the existing mixer",async()=>{
  clientApi.createPlaylist
   .mockRejectedValueOnce(new Error("secret token and media detail"))
   .mockResolvedValueOnce(playlist);
  const mixer=mixerHarness();
  const user=userEvent.setup();
  render(<Slideshow welcomeCopy={welcomeCopy}/>);

  await user.click(screen.getByRole("button",{name:"Begin the journey"}));

  const alert=await screen.findByRole("alert");
  expect(alert.textContent).toBe("We couldn’t start the slideshow. Please try again.");
  expect(alert.textContent).not.toContain("secret token");
  expect(mixer.setTarget).toHaveBeenLastCalledWith(0);
  expect(screen.getByRole<HTMLButtonElement>("button",{name:"Begin the journey"}).disabled).toBe(false);

  await user.click(screen.getByRole("button",{name:"Begin the journey"}));
  await screen.findByRole("button",{name:"Next"});

  expect(soundtrack.createSoundtrackMixer).toHaveBeenCalledOnce();
  expect(mixer.start).toHaveBeenCalledTimes(2);
  expect(clientApi.createPlaylist).toHaveBeenCalledTimes(2);
  expect(analytics.track).toHaveBeenCalledTimes(1);
 });

 test.each(["resolve","reject"] as const)("ignores a late playlist %s after unmount",async(settlement)=>{
  const pending=deferred<typeof playlist>();
  clientApi.createPlaylist.mockReturnValue(pending.promise);
  const mixer=mixerHarness();
  const consoleError=vi.spyOn(console,"error").mockImplementation(()=>{});
  const {unmount}=render(<Slideshow welcomeCopy={welcomeCopy}/>);
  fireEvent.click(screen.getByRole("button",{name:"Begin the journey"}));
  const targetCalls=mixer.setTarget.mock.calls.length;

  unmount();
  expect(mixer.dispose).toHaveBeenCalledOnce();

  await act(async()=>{
   if(settlement==="resolve")pending.resolve(playlist);
   else pending.reject(new Error("late failure"));
  });

  expect(mixer.setTarget).toHaveBeenCalledTimes(targetCalls);
  expect(analytics.track).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();
 });

 test("keeps exactly one soundtrack in the empty-playlist state",async()=>{
  clientApi.createPlaylist.mockResolvedValue({...playlist,items:[]});
  mixerHarness();
  render(<Slideshow welcomeCopy={welcomeCopy}/>);
  fireEvent.click(screen.getByRole("button",{name:"Begin the journey"}));

  expect(await screen.findByText("No liked memories yet")).toBeTruthy();
  expect(document.querySelectorAll("audio")).toHaveLength(1);
 });

 test("renders progressive image layers and preloads exactly the next item",async()=>{
  mixerHarness();
  const firstCleanup=vi.fn();
  preload.preloadMediaItem.mockReturnValueOnce(firstCleanup);
  const {container}=await begin();
  const preview=container.querySelector<HTMLImageElement>(".media-preview")!;
  const original=container.querySelector<HTMLImageElement>(".media-original")!;

  expect(preview.src).toContain(first.thumbnailUrl);
  expect(original.src).toContain(first.mediaUrl);
  expect(preload.preloadMediaItem).toHaveBeenCalledTimes(1);
  expect(preload.preloadMediaItem).toHaveBeenLastCalledWith(second);
  expect(document.querySelectorAll("audio")).toHaveLength(1);

  fireEvent.error(original);
  expect(preview.classList.contains("media-preview-hidden")).toBe(false);
  fireEvent.load(original);
  expect(preview.classList.contains("media-preview-hidden")).toBe(true);
  expect(original.classList.contains("media-original-loaded")).toBe(true);
 });

 test("autoplays an auto-advanced video muted, then unmutes on a viewer tap",async()=>{
  clientApi.createPlaylist.mockResolvedValue({...playlist,items:[second,first]});
  const mixer=mixerHarness();
  const user=userEvent.setup();
  render(<Slideshow welcomeCopy={welcomeCopy}/>);
  await user.click(screen.getByRole("button",{name:"Begin the journey"}));
  await screen.findByRole("button",{name:"Next"});
  const video=document.querySelector<HTMLVideoElement>("video")!;

  expect(video.muted).toBe(true);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  await waitFor(()=>expect(mixer.setTarget).toHaveBeenLastCalledWith(1));

  await user.click(video);
  expect(video.muted).toBe(false);
  await waitFor(()=>expect(mixer.setTarget).toHaveBeenLastCalledWith(.15));
 });

 test("auto-advances past a video whose autoplay is rejected",async()=>{
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("NotAllowedError"));
  clientApi.createPlaylist.mockResolvedValue({...playlist,items:[second,first]});
  mixerHarness();
  const user=userEvent.setup();
  render(<Slideshow welcomeCopy={welcomeCopy}/>);
  await user.click(screen.getByRole("button",{name:"Begin the journey"}));

  await waitFor(()=>expect(document.querySelector(".media-original")).toBeTruthy());
  expect(document.querySelector("video")).toBeNull();
 });

 test("transitions to video, wraps preloading, and mixes soundtrack without pausing it",async()=>{
  const mixer=mixerHarness();
  const firstCleanup=vi.fn();
  const secondCleanup=vi.fn();
  preload.preloadMediaItem.mockReturnValueOnce(firstCleanup).mockReturnValueOnce(secondCleanup);
  const {user,unmount}=await begin();
  const audio=document.querySelector<HTMLAudioElement>("audio")!;
  const pause=vi.mocked(HTMLMediaElement.prototype.pause);

  await user.click(screen.getByRole("button",{name:"Next"}));
  const video=document.querySelector<HTMLVideoElement>("video")!;

  expect(video.getAttribute("poster")).toBe(second.thumbnailUrl);
  expect(video.preload).toBe("auto");
  expect(video.muted).toBe(false);
  expect(firstCleanup).toHaveBeenCalledOnce();
  expect(preload.preloadMediaItem).toHaveBeenCalledTimes(2);
  expect(preload.preloadMediaItem).toHaveBeenLastCalledWith(first);
  await waitFor(()=>expect(mixer.setTarget).toHaveBeenLastCalledWith(.15));
  expect(pause.mock.contexts).not.toContain(audio);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

  await user.click(screen.getByRole("button",{name:"Mute"}));
  expect(video.muted).toBe(true);
  await waitFor(()=>expect(mixer.setTarget).toHaveBeenLastCalledWith(0));

  const mutedTargetCalls=mixer.setTarget.mock.calls.length;
  await user.click(screen.getByRole("button",{name:"Previous"}));
  await waitFor(()=>expect(document.querySelector(".media-original")).toBeTruthy());
  expect(mixer.setTarget).toHaveBeenCalledTimes(mutedTargetCalls+1);
  expect(mixer.setTarget).toHaveBeenLastCalledWith(0);

  await user.click(screen.getByRole("button",{name:"Unmute"}));
  await waitFor(()=>expect(mixer.setTarget).toHaveBeenLastCalledWith(1));

  await user.click(screen.getByRole("button",{name:"Next"}));
  const currentVideo=document.querySelector<HTMLVideoElement>("video")!;
  pause.mockClear();
  await user.click(screen.getByRole("button",{name:"Pause"}));
  expect(pause.mock.contexts).toContain(currentVideo);
  expect(pause.mock.contexts).not.toContain(audio);

  const currentCleanup=preload.preloadMediaItem.mock.results.at(-1)?.value;
  unmount();
  expect(currentCleanup).toHaveBeenCalledOnce();
  expect(mixer.dispose).toHaveBeenCalledOnce();
 });
});
