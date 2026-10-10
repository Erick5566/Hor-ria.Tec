import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(path, mocks={}) {
  const exports={};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>mocks[name]??require(name)});
  return exports;
}
const features=load('lib/platform-features.ts');
const { platformFeatures, featureEnabled, featureForPath, panelPathEnabled, platformFeatureChanges }=features;

test('platform features: all panel modules are configurable, with backward compatible defaults',()=>{
  const expected={
    '/painel':'dashboardEnabled','/painel/ordens':'ordersEnabled','/painel/ordens/nova':'ordersEnabled',
    '/painel/ordens/123':'ordersEnabled','/painel/mesa-reparo':'ordersEnabled','/painel/orcamentos':'quotesEnabled',
    '/painel/agenda':'appointmentsEnabled','/painel/clientes/123':'customersEnabled','/painel/equipamentos/123':'equipmentEnabled',
    '/painel/estoque':'stockEnabled','/painel/vendas':'salesEnabled','/painel/seminovos':'tradeInEnabled',
    '/painel/vitrine':'showcaseEnabled','/painel/pos-venda':'afterSalesEnabled','/painel/servicos':'servicesEnabled',
    '/painel/financeiro?visao=relatorios':'financialEnabled','/painel/relatorios':'financialEnabled',
    '/painel/notas-fiscais/123/imprimir':'invoicesEnabled','/painel/equipe':'teamEnabled',
    '/painel/empresa':'businessEnabled','/painel/minha-pagina':'publicPageEnabled','/painel/pagina-cliente':'publicPageEnabled',
    '/painel/configuracoes':'settingsEnabled',
  };
  assert.equal(platformFeatures.length,20);
  for(const [path,key] of Object.entries(expected)){
    assert.equal(featureForPath(path),key,path);
    assert.equal(panelPathEnabled({[key]:false},path),false,path);
    assert.equal(panelPathEnabled({[key]:true},path),true,path);
  }
  assert.equal(featureEnabled({},'ordersEnabled'),true);
  assert.equal(featureEnabled({},'stockEnabled'),false);
  assert.equal(featureEnabled({},'aiEnabled'),false);
  assert.equal(featureEnabled({},'whatsappEnabled'),false);
});

test('platform features: essential access stays available with every switch off',()=>{
  const off=Object.fromEntries(platformFeatures.map(f=>[f.key,false]));
  for(const path of ['/painel/perfil','/painel/ajuda','/painel/assinatura','/painel/indisponivel','/admin','/painel-outro']){
    assert.equal(panelPathEnabled(off,path),true,path);
  }
});

test('platform features: saving does not drop unknown flags and writes checked and unchecked modules',()=>{
  const form=new FormData();form.set('ordersEnabled','on');form.set('financialEnabled','on');
  const saved=platformFeatureChanges(form,{futureEnabled:true,whatsappEnabled:true});
  assert.equal(saved.futureEnabled,true);assert.equal(saved.ordersEnabled,true);
  assert.equal(saved.whatsappEnabled,false);assert.equal(saved.dashboardEnabled,false);
  assert.equal(saved.financialEnabled,true);
});

test('platform features: controls render every module, descriptions, defaults and busy state',()=>{
  const Controls=load('components/platform-feature-controls.tsx',{'@/lib/platform-features':features}).default;
  const html=renderToStaticMarkup(React.createElement(Controls,{flags:{stockEnabled:true,ordersEnabled:false},disabled:true}));
  assert.equal((html.match(/type="checkbox"/g)||[]).length,20);
  assert.equal((html.match(/<fieldset[^>]*disabled/g)||[]).length,5);
  assert.match(html,/name="stockEnabled"[^>]*checked/);
  assert.doesNotMatch(html,/name="ordersEnabled"[^>]*checked/);
  assert.match(html,/Sempre disponíveis/);assert.match(html,/Não retira anúncios publicados/);
  for(const feature of platformFeatures)assert.ok(html.includes(`name="${feature.key}"`));
});

test('platform features: server guard rejects direct access and keeps enabled routes available',async()=>{
  let access={context:{company:{featureFlags:{ordersEnabled:false}}}};
  const guard=load('lib/require-panel-feature.ts',{
    'server-only':{},'next/navigation':{redirect:url=>{throw new Error('REDIRECT '+url);}},
    './server-auth':{getServerAccess:async()=>access},'./platform-features':features,
  }).requirePanelFeature;
  await assert.rejects(guard('ordersEnabled'),/REDIRECT \/painel\/indisponivel/);
  access.context.company.featureFlags.ordersEnabled=true;
  assert.equal(await guard('ordersEnabled'),access);
  access=null;await assert.rejects(guard('ordersEnabled'),/REDIRECT \/entrar/);
});

test('platform features: dynamic page denies a disabled module before rendering and preserves role checks',async()=>{
  let access={context:{company:{role:'OWNER',featureFlags:{salesEnabled:false,stockEnabled:true,financialEnabled:true}}}};
  const redirect=url=>{throw new Error('REDIRECT '+url);};
  const guard=load('lib/require-panel-feature.ts',{
    'server-only':{},'next/navigation':{redirect},'./server-auth':{getServerAccess:async()=>access},'./platform-features':features,
  });
  const Page=load('app/painel/[module]/page.tsx',{
    'next/navigation':{redirect,notFound:()=>{throw new Error('NOT_FOUND');}},
    '@/lib/platform-features':features,'@/lib/require-panel-feature':guard,
    '@/lib/server-auth':{getServerAccess:async()=>access},
    '@/components/admin-module':{__esModule:true,default:()=>null},
  }).default;
  const props={params:Promise.resolve({module:'vendas'}),searchParams:Promise.resolve({})};
  await assert.rejects(Page(props),/REDIRECT \/painel\/indisponivel/);
  access.context.company.featureFlags.salesEnabled=true;
  assert.equal((await Page(props)).props.module,'vendas');
  access.context.company.role='ATTENDANT';
  await assert.rejects(Page(props),/^Error: REDIRECT \/painel$/);
});
