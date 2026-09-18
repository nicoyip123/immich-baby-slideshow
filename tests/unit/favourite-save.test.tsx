// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,test,vi} from "vitest";
const api=vi.hoisted(()=>({saveFavourite:vi.fn()}));
vi.mock("../../src/client/api.js",()=>api);
import {useSaveFavourite,FavouriteButton} from "../../src/client/FavouriteButton.js";
function Harness({id}:{id:string}){const action=useSaveFavourite(id);return <FavouriteButton {...action}/>}
afterEach(()=>{cleanup();vi.clearAllMocks()});
test("saves once while pending and announces confirmed success",async()=>{
 let resolve!:(value:{saved:true;created:boolean})=>void;
 api.saveFavourite.mockReturnValue(new Promise(done=>{resolve=done}));
 render(<Harness id="photo"/>);
 fireEvent.click(screen.getByRole("button",{name:"Save favourite"}));
 fireEvent.click(screen.getByRole("button",{name:"Saving favourite"}));
 expect(api.saveFavourite).toHaveBeenCalledExactlyOnceWith("photo");
 expect(screen.queryByText("Saved to favourites")).toBeNull();
 await act(async()=>resolve({saved:true,created:true}));
 expect(screen.getByRole("status").textContent).toContain("Saved to favourites");
});
test("shows a retryable failure without marking the moment saved",async()=>{
 api.saveFavourite.mockRejectedValueOnce(new Error("network")).mockResolvedValue({saved:true,created:false});
 render(<Harness id="video"/>);
 fireEvent.click(screen.getByRole("button",{name:"Save favourite"}));
 expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t save");
 fireEvent.click(screen.getByRole("button",{name:"Save favourite"}));
 await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("Already in favourites"));
});
test("ignores a late save result after navigation",async()=>{
 let resolve!:(value:{saved:true;created:boolean})=>void;
 api.saveFavourite.mockReturnValue(new Promise(done=>{resolve=done}));
 const view=render(<Harness id="first"/>);
 fireEvent.click(screen.getByRole("button",{name:"Save favourite"}));
 view.rerender(<Harness id="second"/>);
 await act(async()=>resolve({saved:true,created:true}));
 expect(screen.getByRole("button",{name:"Save favourite"})).toBeTruthy();
 expect(screen.queryByText("Saved to favourites")).toBeNull();
});
test("returning to a moment with an abandoned save never leaves its heart disabled",async()=>{
 let resolve!:(value:{saved:true;created:boolean})=>void;
 api.saveFavourite.mockReturnValue(new Promise(done=>{resolve=done}));
 const view=render(<Harness id="first"/>);
 fireEvent.click(screen.getByRole("button",{name:"Save favourite"}));
 view.rerender(<Harness id="second"/>);
 await act(async()=>resolve({saved:true,created:true}));
 view.rerender(<Harness id="first"/>);
 expect(screen.getByRole<HTMLButtonElement>("button",{name:"Save favourite again"}).disabled).toBe(false);
 expect(screen.getByText("Liked")).toBeTruthy();
});
test("keeps the liked indicator when revisiting a saved moment",async()=>{
 api.saveFavourite.mockResolvedValue({saved:true,created:true});
 const view=render(<Harness id="first"/>);
 fireEvent.click(screen.getByRole("button",{name:"Save favourite"}));
 await screen.findByText("Saved to favourites");
 view.rerender(<Harness id="second"/>);
 view.rerender(<Harness id="first"/>);
 expect(screen.getByText("Liked")).toBeTruthy();
 expect(screen.getByRole("button",{name:"Save favourite again"}).getAttribute("aria-pressed")).toBe("true");
});
test("shows an existing shared like without replaying confirmation",()=>{
 function ExistingLike(){const action=useSaveFavourite("photo",true);return <FavouriteButton {...action}/>}
 render(<ExistingLike/>);
 expect(screen.getByText("Liked")).toBeTruthy();
 expect(screen.queryByRole("status")).toBeNull();
});
