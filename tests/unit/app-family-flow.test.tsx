// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://slideshow.example.com/"}
import {cleanup,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {StrictMode} from "react";
import {afterEach,beforeEach,expect,test,vi} from "vitest";

const clientApi=vi.hoisted(()=>({getWelcomeCopy:vi.fn(),login:vi.fn(),loginWithFamilyLink:vi.fn(),status:vi.fn()}));
const analytics=vi.hoisted(()=>({loadAnalytics:vi.fn(),readConsent:vi.fn(),setConsent:vi.fn(),track:vi.fn()}));

vi.mock("../../src/client/api.js",()=>clientApi);
vi.mock("../../src/client/analytics.js",()=>analytics);

import {App} from "../../src/client/App.js";

const copy={
 eyebrow:"Seren’s little story",
 title:"From your very first days…",
 body:"A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived."
};

beforeEach(()=>{
 window.history.replaceState({},"","/");
 analytics.readConsent.mockReturnValue(null);
 analytics.track.mockImplementation(()=>{});
 clientApi.status.mockResolvedValue({authenticated:false});
 clientApi.login.mockResolvedValue({success:true});
 clientApi.loginWithFamilyLink.mockResolvedValue({success:true});
 clientApi.getWelcomeCopy.mockResolvedValue(copy);
 vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({}),{status:200,headers:{"content-type":"application/json"}})));
});

afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllMocks()});

test("loads welcome copy only after family login",async()=>{
 const user=userEvent.setup();
 render(<App/>);

 await screen.findByRole("button",{name:"Enter"});
 expect(clientApi.getWelcomeCopy).not.toHaveBeenCalled();

 await user.type(screen.getByLabelText("Password"),"family password");
 await user.click(screen.getByRole("button",{name:"Enter"}));

 await waitFor(()=>expect(clientApi.getWelcomeCopy).toHaveBeenCalledTimes(1));
 expect(await screen.findByRole("heading",{name:copy.title})).toBeTruthy();
 expect(screen.queryByText(copy.eyebrow)).toBeTruthy();
 expect(screen.queryByText(copy.body)).toBeTruthy();
});

test("retries welcome copy after a temporary failure",async()=>{
 const user=userEvent.setup();
 clientApi.getWelcomeCopy.mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce(copy);
 render(<App/>);

 await screen.findByRole("button",{name:"Enter"});
 await user.type(screen.getByLabelText("Password"),"family password");
 await user.click(screen.getByRole("button",{name:"Enter"}));

 expect((await screen.findByRole("alert")).textContent).toBe("We couldn't load the welcome screen. Please try again.");
 await user.click(screen.getByRole("button",{name:"Try again"}));
 await waitFor(()=>expect(clientApi.getWelcomeCopy).toHaveBeenCalledTimes(2));
 expect(await screen.findByRole("heading",{name:copy.title})).toBeTruthy();
});

test("exchanges a private link once before loading the family welcome",async()=>{
 const token="ab".repeat(32);
 window.history.replaceState({},"","/");
 analytics.track.mockImplementation((event:string)=>{
  if(event==="page_view")expect(window.location.hash).toBe("");
 });

 render(<StrictMode><App familyLinkToken={token}/></StrictMode>);

 await waitFor(()=>expect(clientApi.loginWithFamilyLink).toHaveBeenCalledTimes(1));
 expect(clientApi.loginWithFamilyLink).toHaveBeenCalledWith(token);
 expect(clientApi.status).not.toHaveBeenCalled();
 await waitFor(()=>expect(clientApi.getWelcomeCopy).toHaveBeenCalledTimes(1));
 expect(await screen.findByRole("heading",{name:copy.title})).toBeTruthy();
 expect(analytics.track).toHaveBeenCalledWith("page_view");
});

test("falls back to the ordinary password screen after a private-link failure",async()=>{
 const token="ab".repeat(32);
 clientApi.loginWithFamilyLink.mockRejectedValueOnce(new Error("401"));

 render(<App familyLinkToken={token}/>);

 expect(await screen.findByRole("button",{name:"Enter"})).toBeTruthy();
 expect(clientApi.loginWithFamilyLink).toHaveBeenCalledTimes(1);
 expect(clientApi.status).not.toHaveBeenCalled();
 expect(document.body.textContent).not.toContain(token);
 expect(document.body.textContent).not.toMatch(/family link|invalid link/i);
});
