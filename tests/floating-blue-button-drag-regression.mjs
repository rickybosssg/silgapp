import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const stack = read("src/components/admin/CourseWindowStack.jsx");
const venus = read("src/components/client/VenusFloatingButton.jsx");

assert.match(stack, /MOBILE_BUTTON_STORAGE_KEY = "silgapp_course_window_stack_button_position"/, "blue stack button position must be persisted with a dedicated key");
assert.match(stack, /MOBILE_BUTTON_DRAG_THRESHOLD = 8/, "tap and drag must be separated by a movement threshold");
assert.match(stack, /function clampMobileButtonPosition\(position\)/, "dragged button must be clamped inside the viewport");
assert.match(stack, /window\.innerWidth - MOBILE_BUTTON_SIZE/, "right edge must keep the button visible");
assert.match(stack, /window\.innerHeight - MOBILE_BUTTON_SIZE - MOBILE_BUTTON_BOTTOM_SAFE/, "bottom edge must keep the button visible above the navigation area");
assert.match(stack, /onPointerDown=\{handleMobilePointerDown\}/, "mobile button must handle touch/pointer drag start");
assert.match(stack, /onPointerMove=\{handleMobilePointerMove\}/, "mobile button must handle touch/pointer dragging");
assert.match(stack, /onPointerUp=\{handleMobilePointerUp\}/, "mobile button must handle touch/pointer drag end");
assert.match(stack, /onPointerCancel=\{handleMobilePointerUp\}/, "mobile button must clean up cancelled gestures");
assert.match(stack, /setPointerCapture\?\.\(event\.pointerId\)/, "pointer capture must keep the drag stable in Android WebView");
assert.match(stack, /releasePointerCapture\?\.\(event\.pointerId\)/, "pointer capture must be released after drag");
assert.match(stack, /suppressMobileClickRef\.current = true/, "drag must suppress the following click");
assert.match(stack, /event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)[\s\S]*return;/, "suppressed drag click must not open the stack");
assert.match(stack, /setMobileOpen\(true\)/, "simple tap must keep the original action");
assert.match(stack, /<Layers className="w-6 h-6" \/>/, "original layers icon must be preserved");
assert.match(stack, /bg-red-500[\s\S]*\{windows\.length\}/, "red badge count must stay attached to the button");
assert.match(stack, /touchAction:\s*"none"/, "dragging the button must not scroll the page uncontrollably");

assert.match(venus, /venus_button_position/, "Venus remains the draggable reference component");

console.log("PASS: floating blue course-stack button is draggable without changing tap action or badge.");
