export function ensureInitialized() {
  if (typeof Parse === "undefined") {
    throw new Error("Parse SDK failed to load. Check your internet connection and reload the page.");
  }

  if (!Parse.applicationId) {
    throw new Error("Initialize Parse first.");
  }
}

export function initializeParse() {
  if (typeof Parse === "undefined") {
    throw new Error("Parse SDK failed to load. Check your internet connection and reload the page.");
  }

  const APP_ID = "DJ4wqUtv7PFZT0icQxfjH9ZrrS9DEbJmo6eUhooD";
  const JS_KEY = "0Iv7kbKtGDHbMIXwUSUAZaFLqgtwuvHbFQgK1tAm";
  const SERVER_URL = "https://parseapi.back4app.com";

  Parse.initialize(APP_ID, JS_KEY);
  Parse.serverURL = SERVER_URL;
}
