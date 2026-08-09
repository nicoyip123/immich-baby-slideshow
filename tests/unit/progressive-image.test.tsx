// @vitest-environment jsdom
import {fireEvent,render} from "@testing-library/react";
import {expect,test} from "vitest";
import {ProgressiveImage} from "../../src/client/ProgressiveImage.js";

const item={
 id:"photo",
 mediaUrl:"/api/media/photo/image",
 thumbnailUrl:"/api/media/photo/thumbnail"
};

test("renders the decorative thumbnail while the original is loading",()=>{
 const {container}=render(<ProgressiveImage item={item}/>);
 const preview=container.querySelector<HTMLImageElement>(".media-preview")!;
 const original=container.querySelector<HTMLImageElement>(".media-original")!;

 expect(preview.getAttribute("src")).toBe(item.thumbnailUrl);
 expect(preview.className).toBe("media media-preview");
 expect(preview.getAttribute("alt")).toBe("");
 expect(preview.getAttribute("aria-hidden")).toBe("true");
 expect(original.getAttribute("src")).toBe(item.mediaUrl);
 expect(original.className).toBe("media kenburns media-original");
 expect(original.getAttribute("alt")).toBe("");
});

test("reveals the original and hides the thumbnail only after a successful load",()=>{
 const {container}=render(<ProgressiveImage item={item}/>);
 const preview=container.querySelector<HTMLImageElement>(".media-preview")!;
 const original=container.querySelector<HTMLImageElement>(".media-original")!;

 fireEvent.load(original);

 expect(original.classList.contains("media-original-loaded")).toBe(true);
 expect(preview.classList.contains("media-preview-hidden")).toBe(true);
});

test("leaves the thumbnail visible when the original fails",()=>{
 const {container}=render(<ProgressiveImage item={item}/>);
 const preview=container.querySelector<HTMLImageElement>(".media-preview")!;
 const original=container.querySelector<HTMLImageElement>(".media-original")!;

 fireEvent.error(original);

 expect(original.classList.contains("media-original-loaded")).toBe(false);
 expect(preview.classList.contains("media-preview-hidden")).toBe(false);
});

test("reveals the original after a thumbnail failure",()=>{
 const {container}=render(<ProgressiveImage item={item}/>);
 const preview=container.querySelector<HTMLImageElement>(".media-preview")!;
 const original=container.querySelector<HTMLImageElement>(".media-original")!;

 fireEvent.error(preview);
 fireEvent.load(original);

 expect(original.classList.contains("media-original-loaded")).toBe(true);
 expect(preview.classList.contains("media-preview-hidden")).toBe(true);
});
