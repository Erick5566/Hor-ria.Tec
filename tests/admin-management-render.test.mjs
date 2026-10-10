import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const mocks = {
  '@/lib/supabase': { supabase: null, message: e => e.message, today: () => '2026-10-09' },
  'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
  './ui': {
    Heading: ({title,subtitle}) => React.createElement('header',null,React.createElement('h1',null,title),React.createElement('p',null,subtitle)),
    ErrorBox: ({error}) => error ? React.createElement('p',{role:'alert'},error):null,
  },
};
const cache = new Map();
function load(name,parent=process.cwd()) {
  if(mocks[name])return mocks[name];
  if(!name.startsWith('.')&&!name.startsWith('@/'))return require(name);
  const base=name.startsWith('@/')?resolve(name.slice(2)):resolve(parent,name);
  const file=[base,base+'.tsx',base+'.ts'].find(existsSync);
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:n=>load(n,dirname(file)),Date,Intl,console});
  return exports;
}
const Dashboard=load('@/components/admin-companies-dashboard').default;
const props={
 initialCompanies:[],
 initialOverview:{currentCompanies:0,maxCompanies:100,featureFlags:{}},
 initialBilling:{receivedThisMonth:0,receivedTotal:0,expensesThisMonth:0,expensesTotal:0,netThisMonth:0,receivableTotal:0,overdueCount:0,pendingCount:0,dueNext24hCount:0,activeSubscriptions:0,trialSubscriptions:0,suspendedCount:0,estimatedMrr:0,graceHours:24},
 initialExpenses:[],
};
test('admin rendered: friendly empty state, attention groups, complete filters and disabled export',()=>{
 const html=renderToStaticMarkup(React.createElement(Dashboard,props));
 assert.match(html,/Quem precisa de atenção/);
 assert.match(html,/Nenhuma empresa encontrada/);
 assert.match(html,/disabled=""[^>]*>Exportar lista/);
 for(const status of ['TRIAL','CANCELED','PENDING_DELETION'])assert.ok(html.includes(`value="${status}"`));
 assert.ok(html.indexOf('Páginas de empresas')<html.indexOf('Despesas da plataforma'));
 assert.match(html,/Data da despesa/);assert.match(html,/Observação \(opcional\)/);
});
test('admin rendered: paginates 18 companies while exporting all filtered rows',()=>{
 const companies=Array.from({length:18},(_,i)=>({id:String(i),name:'Empresa '+i,slug:'empresa-'+i,responsible:'Teste',email:'teste@example.invalid',createdAt:'2026-10-01T12:00:00Z',lastAccessAt:null,status:'TRIAL',usersCount:1,customersCount:0,ordersCount:0,storageBytes:0}));
 const html=renderToStaticMarkup(React.createElement(Dashboard,{...props,initialCompanies:companies}));
 assert.equal((html.match(/aria-selected="false"/g)||[]).length,15);
 assert.match(html,/Exportar lista \(18\)/);
 assert.match(html,/Página 1 de 2/);
});
