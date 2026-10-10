import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => { assert.equal(name, './csv'); return load('lib/csv.ts'); }, Date, Intl });
  modules.set(path, exports); return exports;
}
const { inAdminQueue, filterAdminCompanies, adminCompaniesCsv, companyWhatsapp } = load('lib/admin-management.ts');
const now = Date.parse('2026-10-09T15:00:00Z');
const day = 86400000;
const date = delta => new Date(now + delta * day).toISOString();
const company = (id, extras={}) => ({ id, name:'Assistência São José', slug:'sao-jose', responsible:'Erick', email:'erick@example.invalid', phone:'(85) 99999-1234', status:'ACTIVE', createdAt:date(-10), lastAccessAt:date(-1), dueAt:date(2), amountDue:0, ordersCount:1, customersCount:1, ...extras });

test('admin queues: exact expiry boundaries, unpaid amounts and account state', () => {
  assert.equal(inAdminQueue(company('a',{dueAt:date(-1),amountDue:49}),'OVERDUE',now),true);
  assert.equal(inAdminQueue(company('a',{dueAt:date(-1),amountDue:0}),'OVERDUE',now),false);
  assert.equal(inAdminQueue(company('a',{dueAt:date(7)}),'DUE_SOON',now),true);
  assert.equal(inAdminQueue(company('a',{dueAt:date(7.01)}),'DUE_SOON',now),false);
  assert.equal(inAdminQueue(company('a',{status:'CANCELED'}),'DUE_SOON',now),false);
  assert.equal(inAdminQueue(company('a',{status:'TRIAL',trialEndsAt:date(3)}),'TRIAL_ENDING',now),true);
  assert.equal(inAdminQueue(company('a',{status:'TRIAL',trialEndsAt:date(-1)}),'TRIAL_ENDING',now),false);
  assert.equal(inAdminQueue(company('a',{dueAt:'invalid'}),'DUE_SOON',now),false);
});
test('admin queues: inactivity includes never accessed accounts, not recent or canceled accounts', () => {
  assert.equal(inAdminQueue(company('a',{lastAccessAt:null}),'INACTIVE',now),true);
  assert.equal(inAdminQueue(company('a',{lastAccessAt:null,createdAt:date(-1)}),'INACTIVE',now),false);
  assert.equal(inAdminQueue(company('a',{status:'CANCELED',lastAccessAt:date(-20)}),'INACTIVE',now),false);
  assert.equal(inAdminQueue(company('a',{ordersCount:0}),'NO_ORDERS',now),true);
});
test('admin search: accents, slug, formatted phone and exact subscription status', () => {
  const rows=[company('a'),company('b',{status:'TRIAL'})];
  for(const search of ['sao jose','sao-jose','85999991234','(85) 99999-1234','ERICK']) assert.equal(filterAdminCompanies(rows,{search,now}).length,2);
  assert.equal(filterAdminCompanies(rows,{status:'ACTIVE',now}).length,1);
  assert.equal(filterAdminCompanies(rows,{status:'TRIAL',now})[0].id,'b');
});
test('admin sorting: null dates sort last, no mutation, queue and search intersect', () => {
  const rows=[company('none',{dueAt:null}),company('later',{dueAt:date(3)}),company('first',{dueAt:date(1),amountDue:49})];
  assert.deepEqual(Array.from(filterAdminCompanies(rows,{sort:'due',now}),r=>r.id),['first','later','none']);
  assert.equal(rows[0].id,'none');
  assert.equal(filterAdminCompanies(rows,{sort:'amount_due',now})[0].id,'first');
  assert.equal(filterAdminCompanies(rows,{search:'absent',queue:'DUE_SOON',now}).length,0);
});
test('admin CSV exports all filtered records and neutralizes formulas in contact data', () => {
  const rows=Array.from({length:18},(_,i)=>company(String(i),{name:'=1+1',email:'\t=1+1'}));
  const csv=adminCompaniesCsv(rows);
  assert.equal(csv.split('\r\n').length,19);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'\t=1+1"'));
  assert.ok(csv.includes('"0,00"'));
});
test('admin WhatsApp only accepts complete Brazilian phone numbers', () => {
  assert.equal(companyWhatsapp('(85) 99999-1234'),'https://wa.me/5585999991234');
  assert.equal(companyWhatsapp('+55 (85) 99999-1234'),'https://wa.me/5585999991234');
  for(const phone of [null,'','123','javascript:alert(1)','+1 222 333 4444 555'])assert.equal(companyWhatsapp(phone),null);
});
