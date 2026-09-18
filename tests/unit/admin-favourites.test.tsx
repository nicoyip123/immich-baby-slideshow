// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
const api=vi.hoisted(()=>({getFavourites:vi.fn(),removeFavourite:vi.fn()}));
vi.mock("../../src/client/api.js",()=>api);
import {AdminFavourites} from "../../src/client/AdminFavourites.js";
const photo={assetId:"photo",mediaType:"IMAGE",savedAt:"2026-09-18T00:00:00Z",thumbnailUrl:"/photo/thumbnail",mediaUrl:"/photo/image"};
beforeEach(()=>{
 api.getFavourites.mockResolvedValue({items:[photo]});
 api.removeFavourite.mockResolvedValue({success:true});
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","")};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute("open")};
});
afterEach(()=>{cleanup();vi.clearAllMocks()});
test("lists saved moments and previews the original photo",async()=>{
 render(<AdminFavourites/>);
 fireEvent.click(await screen.findByRole("button",{name:"View photo"}));
 const dialog=screen.getByRole("dialog");
 expect(dialog.querySelector("img")?.getAttribute("src")).toBe(photo.mediaUrl);
 fireEvent.click(screen.getByRole("button",{name:"Close preview"}));
 expect(screen.queryByRole("dialog")).toBeNull();
});
test("previews videos with playback controls",async()=>{
 api.getFavourites.mockResolvedValue({items:[{...photo,mediaType:"VIDEO",mediaUrl:"/video/playback"}]});
 render(<AdminFavourites/>);
 fireEvent.click(await screen.findByRole("button",{name:"View video"}));
 expect(screen.getByRole("dialog").querySelector("video")?.controls).toBe(true);
});
test("removes a favourite after server confirmation",async()=>{
 render(<AdminFavourites/>);
 fireEvent.click(await screen.findByRole("button",{name:"Remove favourite"}));
 await screen.findByText("No favourites yet");
 expect(api.removeFavourite).toHaveBeenCalledExactlyOnceWith("photo");
});
test("keeps the moment visible when removal fails and allows retry",async()=>{
 api.removeFavourite.mockRejectedValueOnce(new Error("network"));
 render(<AdminFavourites/>);
 fireEvent.click(await screen.findByRole("button",{name:"Remove favourite"}));
 expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t remove");
 expect(screen.getByRole("button",{name:"View photo"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Remove favourite"}));
 await screen.findByText("No favourites yet");
});
test("shows a retry action when loading fails",async()=>{
 api.getFavourites.mockRejectedValueOnce(new Error("network"));
 render(<AdminFavourites/>);
 fireEvent.click(await screen.findByRole("button",{name:"Try again"}));
 await waitFor(()=>expect(api.getFavourites).toHaveBeenCalledTimes(2));
 expect(await screen.findByRole("button",{name:"View photo"})).toBeTruthy();
});
