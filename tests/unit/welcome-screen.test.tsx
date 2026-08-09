// @vitest-environment jsdom
import {cleanup,render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach,expect,test,vi} from "vitest";
import {WelcomeScreen} from "../../src/client/WelcomeScreen.js";

afterEach(cleanup);

test("renders the supplied welcome copy and begins the journey",async()=>{
 const onBegin=vi.fn();
 const user=userEvent.setup();
 const copy={eyebrow:"A little story",title:"From the beginning",body:"Small moments, held close."};
 render(<WelcomeScreen copy={copy} onBegin={onBegin}/>);

 expect(screen.queryByText(copy.eyebrow)).toBeTruthy();
 expect(screen.queryByRole("heading",{name:copy.title})).toBeTruthy();
 expect(screen.queryByText(copy.body)).toBeTruthy();
 const begin=screen.getByRole<HTMLButtonElement>("button",{name:"Begin the journey"});
 expect(begin.disabled).toBe(false);
 expect(screen.queryByRole("alert")).toBeNull();
 await user.click(begin);
 expect(onBegin).toHaveBeenCalledTimes(1);
});

test("shows accessible pending and generic failure states",async()=>{
 const onBegin=vi.fn();
 const user=userEvent.setup();
 const copy={eyebrow:"A little story",title:"From the beginning",body:"Small moments, held close."};
 const {rerender}=render(<WelcomeScreen copy={copy} onBegin={onBegin} busy/>);
 const pending=screen.getByRole<HTMLButtonElement>("button",{name:"Loading memories…"});

 expect(pending.disabled).toBe(true);
 await user.click(pending);
 expect(onBegin).not.toHaveBeenCalled();

 rerender(<WelcomeScreen copy={copy} onBegin={onBegin} error/>);

 expect(screen.getByRole("alert").textContent).toBe("We couldn’t start the slideshow. Please try again.");
 expect(screen.getByRole<HTMLButtonElement>("button",{name:"Begin the journey"}).disabled).toBe(false);
});
