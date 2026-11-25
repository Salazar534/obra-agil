// The API service runs the API. Every other copy of this image is a frontend:
// the public site, the app, or both, chosen from the request host.
const name = process.env.RAILWAY_SERVICE_NAME;
if (name === "api") {
  await import("../server/index.ts");
} else {
  await import("./serve-web.mjs");
}
