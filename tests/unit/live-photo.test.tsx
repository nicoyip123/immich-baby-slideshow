// @vitest-environment jsdom
import {cleanup,fireEvent,render,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,test,vi} from "vitest";
import {LivePhoto} from "../../src/client/LivePhoto.js";

beforeEach(()=>{vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

const item={id:"lp",mediaUrl:"/api/media/lp/image",thumbnailUrl:"/api/media/lp/thumbnail"};

describe("LivePhoto",()=>{
 test("overlays a muted autoplaying motion clip above the still",()=>{
  const {container}=render(<LivePhoto item={item} motionUrl="/api/media/motion/video"/>);
  const video=container.querySelector<HTMLVideoElement>("video.media-motion")!;
  expect(container.querySelector(".media-original")).toBeTruthy();
  expect(video.muted).toBe(true);
  expect(video.hasAttribute("autoplay")).toBe(true);
  expect(video.hasAttribute("playsinline")).toBe(true);
  expect(video.getAttribute("src")).toBe("/api/media/motion/video");
  expect(video.getAttribute("poster")).toBe("/api/media/lp/thumbnail");
  expect(video.classList.contains("media-motion-done")).toBe(false);
 });

 test("reveals the still when the motion ends",()=>{
  const {container}=render(<LivePhoto item={item} motionUrl="/m"/>);
  const video=container.querySelector<HTMLVideoElement>("video.media-motion")!;
  fireEvent.ended(video);
  expect(video.classList.contains("media-motion-done")).toBe(true);
 });

 test("reveals the still when the motion fails",()=>{
  const {container}=render(<LivePhoto item={item} motionUrl="/m"/>);
  const video=container.querySelector<HTMLVideoElement>("video.media-motion")!;
  fireEvent.error(video);
  expect(video.classList.contains("media-motion-done")).toBe(true);
 });

 test("reveals the still when motion autoplay is blocked",async()=>{
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("NotAllowedError"));
  const {container}=render(<LivePhoto item={item} motionUrl="/m"/>);
  const video=container.querySelector<HTMLVideoElement>("video.media-motion")!;
  await waitFor(()=>expect(video.classList.contains("media-motion-done")).toBe(true));
 });
});
