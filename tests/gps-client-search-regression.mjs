import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");

const form = read("src/pages/CourseExterneFormSync.jsx");
const clientApp = read("src/pages/ClientExterneApp.jsx");
const suivi = read("src/components/client/SuiviCourseFullscreen.jsx");
const clientSuivi = read("src/pages/ClientSuiviCourse.jsx");
const gpsHook = read("src/hooks/useGPSNatif.js");
const heartbeat = read("src/hooks/useHeartbeat.js");
const livreurApp = read("src/pages/LivreurExterneApp.jsx");
const capConfig = read("capacitor.config.json");

assert.match(form, /createResult\?\.data\?\.data\s*\?\?\s*createResult\?\.data\s*\?\?\s*createResult/, "creerCourseClient response must be normalized through nested data wrappers");
assert.match(form, /open_recherche_course_id:\s*response\.id/, "created course id must be sent to the client dashboard");
assert.match(form, /created_course:\s*response/, "created course object must be sent immediately to the client dashboard");
assert.doesNotMatch(form, /<LivreurRechercheAnimation/, "old local search screen must not be rendered after creation");

assert.match(clientApp, /useLocation\(/, "client dashboard must read router state");
assert.match(clientApp, /location\.state\?\.open_recherche_course_id/, "client dashboard must consume created course id");
assert.match(clientApp, /setCoursesActives\(\(old = \[\]\)/, "created course must be injected into active courses immediately");
assert.match(clientApp, /setShowRecherche\(true\)/, "RechercheLivreurScreen must open immediately after creation");
assert.match(clientApp, /navigate\("\/client",\s*\{\s*replace:\s*true,\s*state:\s*\{\}\s*\}\)/, "router state must be cleared after consuming immediate search");
assert.match(clientApp, /const intervalMs = \(showRecherche \|\| showSuiviFullscreen\) \? 5000 : 8000/, "visible search/tracking screens need 5s fallback polling only while visible");

assert.match(suivi, /formatGpsAge/, "tracking map must compute displayed GPS age from the GPS timestamp");
assert.match(suivi, /course\?\._livreur\?\.derniere_position_date \|\| course\?\._livreur\?\.last_seen_at/, "GPS freshness must use the driver's real position timestamp");
assert.match(suivi, /Position mise à jour il y a/, "fresh GPS label must be displayed");
assert.match(suivi, /Position ancienne — il y a/, "stale GPS label must be displayed");

assert.match(clientSuivi, /refetchInterval:\s*5000/, "dedicated tracking page must have a 5s visible fallback polling");

assert.match(gpsHook, /minDistanceM = 10/, "GPS hook must support a configurable min distance");
assert.match(gpsHook, /Math\.max\(1,\s*Number\(minDistanceM\)/, "GPS min distance must be bounded");
assert.match(heartbeat, /distanceFilter:\s*getConfig\(\)\.gps_distance_filter_m/, "native Android background heartbeat must use the dynamic distance filter");
assert.match(livreurApp, /livreurProfil\?\.statut === "en_course"[\s\S]*5000/, "driver GPS must switch to a 5s active-course cadence");
assert.match(livreurApp, /minDistanceM:\s*gpsDistanceFilterM/, "driver GPS hook must use the configured distance filter");

assert.doesNotMatch(capConfig, /"url"\s*:/, "Capacitor release config must not include server.url");
assert.doesNotMatch(form, /window\.location\.replace|location\.reload\(|window\.location\.href/, "creation form must use SPA navigation/state after success, not reloads");

console.log("PASS: GPS freshness and immediate client search regressions are guarded.");
