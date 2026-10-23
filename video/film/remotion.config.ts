/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
// light leaks (@remotion/effects) need WebGL2 while rendering
Config.setChromiumOpenGlRenderer("angle");
Config.setCodec("h264");
Config.setCrf(14);
