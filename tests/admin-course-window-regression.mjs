import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
test('course window visuals escape transformed route, preserve IDs and use safe mobile placement',()=>{
 const source=readFileSync(new URL('../src/components/admin/CourseWindowStack.jsx',import.meta.url),'utf8');
 assert.match(source,/return createPortal\(/);assert.match(source,/<\/>, document.body/);
 assert.match(source,/fixed left-4/);assert.match(source,/5rem \+ env\(safe-area-inset-bottom/);
 assert.match(source,/courseId=\{w.courseId\}/);assert.match(source,/onClose=\{\(\) => removeWindow\(w.courseId\)\}/);
 assert.match(source,/windows.length === 0/);assert.doesNotMatch(source,/annulerCourse|creerCourse|\.entities\./);
});
test('layout owns the stack; standalone form keeps its default renderer without changing submission',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const form=readFileSync(new URL('../src/pages/AdminCourseForm.jsx',import.meta.url),'utf8');
 assert.match(app,/path="\/admin\/nouvelle-course" element=\{<AdminCourseForm showCourseWindows=\{false\}/);
 assert.match(form,/showCourseWindows = true/);assert.match(form,/showCourseWindows && <CourseWindowStack/);
});
