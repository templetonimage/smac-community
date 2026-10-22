// SMAC Storage rules tests — runs against the Storage emulator.
import { test, before, after } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";

let env;
const ADMIN = { uid: "adminUid", email: "nate@templetonimage.com" };
const ALICE = { uid: "alice", email: "alice@x.com" };
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDA==";
const SVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";

const st = (u) => (u ? env.authenticatedContext(u.uid, { email: u.email }) : env.unauthenticatedContext()).storage();
const put = (u, path, dataUrl) => Promise.resolve(st(u).ref(path).putString(dataUrl, "data_url")).then(() => true);
const del = (u, path) => st(u).ref(path).delete();
const url = (u, path) => st(u).ref(path).getDownloadURL();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-smac",
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref("profile_photos/bob.jpg").putString(JPEG, "data_url");
    await ctx.storage().ref("profile_photos/alice.jpg").putString(JPEG, "data_url");
  });
});
after(async () => { await env.cleanup(); });

test("ALLOW member uploads own photo", () => assertSucceeds(put(ALICE, "profile_photos/alice.jpg", JPEG)));
test("ALLOW member reads another's photo (avatars)", () => assertSucceeds(url(ALICE, "profile_photos/bob.jpg")));
test("DENY member overwrites another's photo", () => assertFails(put(ALICE, "profile_photos/bob.jpg", JPEG)));
test("DENY member uploads under a random name", () => assertFails(put(ALICE, "profile_photos/anything.jpg", JPEG)));
test("DENY SVG upload", () => assertFails(put(ALICE, "profile_photos/alice.jpg", SVG)));
test("DENY upload outside profile_photos", () => assertFails(put(ALICE, "evil/alice.jpg", JPEG)));
test("DENY signed-out read", () => assertFails(url(null, "profile_photos/bob.jpg")));
test("DENY member deletes another's photo", () => assertFails(del(ALICE, "profile_photos/bob.jpg")));
test("ALLOW admin replaces a member photo", () => assertSucceeds(put(ADMIN, "profile_photos/bob.jpg", JPEG)));
test("ALLOW member removes own photo", () => assertSucceeds(del(ALICE, "profile_photos/alice.jpg")));
