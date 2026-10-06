import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
const path='components/admin-companies-dashboard.tsx';
function actionSource(name){const ast=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let source;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)source=node.getText(ast);if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name&&ts.isCallExpression(node.initializer))source=`this.${name} = `+node.initializer.arguments[0].getText(ast);ts.forEachChild(node,visit);};visit(ast);assert.ok(source);return source;}
function context(extra){const ctx={selectedCompanyRef:{current:null},adminRefreshVersionRef:{current:0},noteDirtyRef:{current:false},setSelectedCompanyId:()=>{},setDetailLoading:()=>{},setDetailError:()=>{},setDetail:()=>{},setNote:()=>{},setCompanyRows:()=>{},setOverview:()=>{},setBilling:()=>{},setExpenses:()=>{},message:e=>e.message,window:{setTimeout:()=>0},...extra};vm.createContext(ctx);return ctx;}
function load(ctx,name){vm.runInContext(ts.transpileModule(actionSource(name),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,ctx);}

test('admin: older company selection cannot replace the newer company detail',async()=>{
  const pending=new Map();let displayed;
  const ctx=context({supabase:{rpc:(_name,args)=>new Promise(resolve=>pending.set(args.p_empresa,resolve))},setDetail:value=>{displayed=value;}});load(ctx,'selectCompany');
  const a=ctx.selectCompany({id:'a'}),b=ctx.selectCompany({id:'b'});
  pending.get('b')({data:{id:'b',note:''},error:null});await b;
  pending.get('a')({data:{id:'a',note:''},error:null});await a;
  assert.equal(displayed.id,'b');
});

test('admin: live refresh preserves an unsaved note',async()=>{
  let note='Unsaved local note';
  const ctx=context({selectedCompanyId:'b',selectedCompanyRef:{current:'b'},noteDirtyRef:{current:true},setNote:value=>{note=value;},supabase:{rpc:async name=>({data:name==='admin_company_detail'?{id:'b',note:'Old saved note'}:[],error:null})}});load(ctx,'refreshAdminData');
  await ctx.refreshAdminData();assert.equal(note,'Unsaved local note');
});

test('admin: an older refresh cannot overwrite newer overview data',async()=>{
  let old=true,displayed;const pending=[];
  const ctx=context({selectedCompanyId:null,setCompanyRows:value=>{displayed=value;},supabase:{rpc:()=>old?new Promise(resolve=>pending.push(resolve)):Promise.resolve({data:['new'],error:null})}});load(ctx,'refreshAdminData');
  const first=ctx.refreshAdminData();old=false;await ctx.refreshAdminData();
  pending.forEach(resolve=>resolve({data:['old'],error:null}));await first;
  assert.equal(displayed[0],'new');
});

test('admin: payment refresh cannot replace a subsequently selected company',async()=>{
  let resolveDetail,displayed={id:'b'};
  const ctx=context({detail:{id:'a',subscription:{id:'sa'}},selectedCompanyRef:{current:'a'},paymentBusy:false,paymentLockRef:{current:false},paymentConfirmationRef:{current:new Map()},crypto:webcrypto,window:{confirm:()=>true},setPaymentBusy:()=>{},setNotice:()=>{},money:String,refreshAdminData:async()=>{},setDetail:value=>{displayed=value;},supabase:{rpc:async name=>name==='admin_confirm_manual_payment'?{data:{amount:44.99},error:null}:new Promise(resolve=>{resolveDetail=resolve;})}});
  load(ctx,'confirmManualPayment');
  const action=ctx.confirmManualPayment();await new Promise(resolve=>setImmediate(resolve));
  ctx.selectedCompanyRef.current='b';resolveDetail({data:{id:'a'},error:null});await action;
  assert.equal(displayed.id,'b');
});
