import { registerRootComponent } from "expo";

import "./src/background"; // registers the background push task first
import App from "./App";

if (!__DEV__) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

registerRootComponent(App);
