import { registerRootComponent } from "expo";

import "./src/background"; // registers the background push task first
import App from "./App";
import { Platform } from "react-native";
import { registerWidgetTaskHandler } from "react-native-android-widget";
import { widgetTaskHandler } from "./src/widget/handler";

if (!__DEV__) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

registerRootComponent(App);
if (Platform.OS === "android") registerWidgetTaskHandler(widgetTaskHandler);
