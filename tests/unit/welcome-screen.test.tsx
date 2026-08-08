// @vitest-environment jsdom
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect,test,vi} from "vitest";
import {WelcomeScreen} from "../../src/client/WelcomeScreen.js";

test("renders Seren's welcome copy and begins the journey",async()=>{
 const onBegin=vi.fn();
 const user=userEvent.setup();
 render(<WelcomeScreen onBegin={onBegin}/>);

 expect(screen.queryByText("Seren’s little story")).toBeTruthy();
 expect(screen.queryByRole("heading",{name:"From your very first days…"})).toBeTruthy();
 expect(screen.queryByText("A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived.")).toBeTruthy();
 await user.click(screen.getByRole("button",{name:"Begin the journey"}));
 expect(onBegin).toHaveBeenCalledTimes(1);
});
