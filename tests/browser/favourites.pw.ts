import {test,expect,type Page} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

async function fixture(page:Page){
 const saved=new Map<string,{assetId:string;mediaType:string;savedAt:string;thumbnailUrl:string;mediaUrl:string}>();
 let saves=0;
 await page.route("https://slideshow.test/**",async route=>{
  const url=new URL(route.request().url());
  const path=url.pathname;
  if(path==="/"||path==="/admin")return route.fulfill({contentType:"text/html",body:await readFile("dist/client/index.html","utf8")});
  if(path.startsWith("/assets/"))return route.fulfill({path:resolve("dist/client",path.slice(1))});
  if(path.includes("/media/"))return route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#e9d0b8"/><stop offset="1" stop-color="#77918c"/></linearGradient></defs><rect width="900" height="1200" fill="url(#a)"/><circle cx="450" cy="520" r="180" fill="#f7ede1"/><text x="450" y="820" text-anchor="middle" font-size="40" fill="#304744">A favourite moment</text></svg>'});
  if(path==="/api/public-config")return route.fulfill({json:{photoDurationMs:600000}});
  if(path.endsWith("/status"))return route.fulfill({json:{authenticated:true}});
  if(path==="/api/welcome")return route.fulfill({json:{eyebrow:"A little story",title:"Welcome",body:"Family memories"}});
  if(path==="/api/playlist")return route.fulfill({json:{playlistId:"p",photoDurationMs:600000,items:[{id:"photo",type:"IMAGE",isFavourite:saved.has("photo"),durationMs:null,ageLabel:"One month",impressionToken:"token",mediaUrl:"/api/media/photo/image",thumbnailUrl:"/api/media/photo/thumbnail"}]}});
  if(path==="/api/favourites"){
   saves++;const {assetId}=route.request().postDataJSON();const created=!saved.has(assetId);
   saved.set(assetId,{assetId,mediaType:"IMAGE",savedAt:"2026-09-18T00:00:00Z",thumbnailUrl:`/api/admin/media/${assetId}/thumbnail`,mediaUrl:`/api/admin/media/${assetId}/image`});
   return route.fulfill({json:{saved:true,created}});
  }
  if(path==="/api/admin/favourites")return route.fulfill({json:{items:[...saved.values()]}});
  if(path.startsWith("/api/admin/favourites/")&&route.request().method()==="DELETE"){saved.delete(path.split("/").at(-1)!);return route.fulfill({json:{success:true}})}
  if(path==="/api/admin/stats")return route.fulfill({json:{items:[]}});
  return route.fulfill({status:404,json:{error:"fixture endpoint not found"}});
 });
 return {saved,get saves(){return saves}};
}

test("mobile double tap saves once and admin can preview and remove",async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();const data=await fixture(page);
 await page.goto("https://slideshow.test/");
 await page.getByRole("button",{name:"Begin the journey"}).tap();
 await expect(page.locator("main.stage")).toBeVisible();
 await page.touchscreen.tap(190,350);await page.touchscreen.tap(190,350);
 await expect(page.getByRole("status")).toHaveText("Saved to favourites");
 expect(data.saves).toBe(1);
 await expect(page.locator(".heart-burst-icon")).toHaveCSS("animation-name","favourite-pop");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:"/tmp/slideshow-favourites-mobile.png"});
 await page.goto("https://slideshow.test/admin");
 await page.getByRole("button",{name:"Favourites",exact:true}).tap();
 await expect(page.getByText("1 saved moment")).toBeVisible();
 await page.screenshot({path:"/tmp/slideshow-favourites-admin-mobile.png",fullPage:true});
 await page.getByRole("button",{name:"View photo"}).tap();
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.getByRole("button",{name:"Close preview"}).tap();
 await page.getByRole("button",{name:"Remove favourite"}).tap();
 await expect(page.getByText("No favourites yet")).toBeVisible();
 expect(data.saved.size).toBe(0);
 await context.close();
});

test("desktop double click saves and keyboard can reach the faded heart",async({page})=>{
 await fixture(page);
 await page.goto("https://slideshow.test/");
 await page.getByRole("button",{name:"Begin the journey"}).click();
 await page.locator("main.stage").dblclick({position:{x:300,y:300}});
 await expect(page.getByRole("status")).toContainText("Saved to favourites");
 await expect(page.locator("main.stage")).not.toHaveClass(/controls-visible/,{timeout:5000});
 await expect(page.locator(".favourite-tools")).toHaveCSS("opacity","1");
 await expect(page.getByText("Liked",{exact:true})).toBeVisible();
 await page.keyboard.press("Tab");
 const heart=page.getByRole("button",{name:"Save favourite again"});
 await expect(heart).toBeFocused();
 await expect(page.locator(".favourite-tools")).toHaveCSS("opacity","1");
 await page.keyboard.press("Enter");
 await expect(page.getByRole("status")).toContainText("Already in favourites");
 await page.goto("https://slideshow.test/admin");
 await page.getByRole("button",{name:"Favourites",exact:true}).click();
 await page.screenshot({path:"/tmp/slideshow-favourites-admin-desktop.png",fullPage:true});
});

test("a saved like survives reload and repeated likes replay confirmation",async({page})=>{
 await fixture(page);
 await page.goto("https://slideshow.test/");
 await page.getByRole("button",{name:"Begin the journey"}).click();
 await page.locator("main.stage").dblclick({position:{x:300,y:300}});
 await expect(page.getByRole("status")).toHaveText("Saved to favourites");
 await expect(page.locator(".heart-burst-icon")).toHaveCSS("transform","matrix(1, 0, 0, 1, 0, 0)");
 await page.screenshot({path:"/tmp/slideshow-like-animation.png"});
 await expect(page.getByRole("status")).toHaveCount(0,{timeout:5000});
 await expect(page.getByText("Liked",{exact:true})).toBeVisible();
 await page.locator("main.stage").dblclick({position:{x:300,y:300}});
 await expect(page.getByRole("status")).toHaveText("Already in favourites");
 await expect(page.locator(".heart-burst-icon")).toHaveCSS("animation-name","favourite-pop");
 await page.reload();
 await page.getByRole("button",{name:"Begin the journey"}).click();
 await expect(page.getByText("Liked",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Save favourite again"})).toHaveAttribute("aria-pressed","true");
 await expect(page.getByRole("status")).toHaveCount(0);
});

test("reduced motion keeps clear like confirmation without animation",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await fixture(page);
 await page.goto("https://slideshow.test/");
 await page.getByRole("button",{name:"Begin the journey"}).click();
 await page.locator("main.stage").dblclick({position:{x:300,y:300}});
 await expect(page.getByRole("status")).toHaveText("Saved to favourites");
 await expect(page.locator(".heart-burst-icon")).toHaveCSS("animation-name","none");
 await expect(page.getByText("Liked",{exact:true})).toBeVisible();
});
