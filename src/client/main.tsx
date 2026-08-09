import React from "react";
import {createRoot} from "react-dom/client";
import {App} from "./App.js";
import {takeFamilyLinkToken} from "./family-link.js";
import "./styles.css";
const familyLinkToken=takeFamilyLinkToken();
createRoot(document.getElementById("root")!).render(<React.StrictMode><App familyLinkToken={familyLinkToken}/></React.StrictMode>);
