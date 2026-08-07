// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://slideshow.example.com/"}
import {beforeEach,describe,expect,it} from "vitest";
import {loadAnalytics,readConsent,setConsent,track} from "../../src/client/analytics.js";

describe("analytics consent",()=>{
  beforeEach(()=>{
    const values=new Map<string,string>();
    Object.defineProperty(window,"localStorage",{configurable:true,value:{
      clear:()=>values.clear(),
      getItem:(name:string)=>values.get(name)??null,
      setItem:(name:string,value:string)=>values.set(name,value)
    }});
    document.head.innerHTML="";delete window.gtag;delete window.dataLayer;
  });
  it("does not load or track before explicit consent",()=>{loadAnalytics("G-TEST123");track("slideshow_started");expect(document.querySelector("script[data-ga4]")).toBeNull();expect(window.dataLayer).toBeUndefined()});
  it("loads only after consent and sends only allowlisted events",()=>{setConsent("granted","G-TEST123");expect(readConsent()).toBe("granted");expect(document.querySelector("script[data-ga4]")?.getAttribute("src")).toContain("G-TEST123");track("slideshow_started");expect(window.dataLayer?.some(entry=>Array.isArray(entry)&&entry[1]==="slideshow_started")).toBe(true)});
});
