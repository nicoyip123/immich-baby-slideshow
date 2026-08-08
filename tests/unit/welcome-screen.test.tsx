// @vitest-environment jsdom
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect,test,vi} from "vitest";
import {WelcomeScreen} from "../../src/client/WelcomeScreen.js";

test("renders the supplied welcome copy and begins the journey",async()=>{
 const onBegin=vi.fn();
 const user=userEvent.setup();
 const copy={eyebrow:"A little story",title:"From the beginning",body:"Small moments, held close."};
 render(<WelcomeScreen copy={copy} onBegin={onBegin}/>);

 expect(screen.queryByText(copy.eyebrow)).toBeTruthy();
 expect(screen.queryByRole("heading",{name:copy.title})).toBeTruthy();
 expect(screen.queryByText(copy.body)).toBeTruthy();
 await user.click(screen.getByRole("button",{name:"Begin the journey"}));
 expect(onBegin).toHaveBeenCalledTimes(1);
});
