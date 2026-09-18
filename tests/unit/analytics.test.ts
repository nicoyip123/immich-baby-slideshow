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
  it("queues commands in the format accepted by the Google tag",()=>{
    setConsent("granted","G-TEST123");
    expect(window.dataLayer?.length).toBeGreaterThan(0);
    for(const command of window.dataLayer!)expect(Object.prototype.toString.call(command)).toBe("[object Arguments]");
  });
  it("sends one explicit page view when consent is first granted",()=>{
    setConsent("granted","G-TEST123");
    const commands=window.dataLayer as IArguments[];
    expect(commands.find(command=>command[0]==="config")?.[2]).toMatchObject({send_page_view:false});
    expect(commands.filter(command=>command[0]==="event"&&command[1]==="page_view")).toHaveLength(1);
  });
  it("does not inject a tag when no measurement ID is configured",()=>{
    setConsent("granted");loadAnalytics("");
    expect(document.querySelector("script[data-ga4]")).toBeNull();
  });
  it("does not load or track before explicit consent",()=>{loadAnalytics("G-TEST123");track("slideshow_started");expect(document.querySelector("script[data-ga4]")).toBeNull();expect(window.dataLayer).toBeUndefined()});
  it("loads only after consent and sends only allowlisted events",()=>{setConsent("granted","G-TEST123");expect(readConsent()).toBe("granted");expect(document.querySelector("script[data-ga4]")?.getAttribute("src")).toContain("G-TEST123");track("slideshow_started");expect(window.dataLayer?.some(entry=>Object.prototype.toString.call(entry)==="[object Arguments]"&&(entry as IArguments)[1]==="slideshow_started")).toBe(true)});
});
