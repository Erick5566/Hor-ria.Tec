import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
const path='components/admin-companies-dashboard.tsx';
function actionSource(name){const ast=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let source;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)source=node.getText(ast);if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name&&ts.isCallExpression(node.initializer))source=`this.${name} = `+node.initializer.arguments[0].getText(ast);ts.forEachChild(node,visit);};visit(ast);assert.ok(source);return source;}
function context(extra){const ctx={noteRevisionRef:{current:0},noteSaveLockRef:{current:false},setNoteBusy:()=>{},setNotice:()=>{},selectedCompanyRef:{current:null},adminRefreshVersionRef:{current:0},noteDirtyRef:{current:false},setSelectedCompanyId:()=>{},setDetailLoading:()=>{},setDetailError:()=>{},setDetail:()=>{},setNote:()=>{},setCompanyRows:()=>{},setOverview:()=>{},setBilling:()=>{},setExpenses:()=>{},message:e=>e.message,window:{setTimeout:()=>0},...extra};vm.createContext(ctx);return ctx;}
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
  const ctx=context({detail:{id:'a',subscription:{id:'sa'}},selectedCompanyRef:{current:'a'},paymentBusy:false,paymentLockRef:{current:false},paymentConfirmationRef:{current:new Map()},crypto:webcrypto,window:{confirm:()=>true},setPaymentBusy:()=>{},setNotice:()=>{},money:String,refreshAdminData:async()=>{},setDetail:value=>{displayed=value;},supabase:{rpc:async name=>name==='admin_payment_operation'?{data:{confirmationId:'operation-a',status:'pending'},error:null}:name==='admin_complete_payment_operation'?{data:null,error:null}:name==='admin_confirm_manual_payment'?{data:{amount:44.99},error:null}:new Promise(resolve=>{resolveDetail=resolve;})}});
  load(ctx,'confirmManualPayment');
  const action=ctx.confirmManualPayment();await new Promise(resolve=>setImmediate(resolve));
  ctx.selectedCompanyRef.current='b';resolveDetail({data:{id:'a'},error:null});await action;
  assert.equal(displayed.id,'b');
});


test('admin: changing company cannot discard a draft without confirmation',async()=>{
  let requested=false;
  const ctx=context({selectedCompanyRef:{current:'a'},noteDirtyRef:{current:true},window:{confirm:()=>false},supabase:{rpc:async()=>{requested=true;return {data:{id:'b'}}}}});
  load(ctx,'selectCompany');await ctx.selectCompany({id:'b'});
  assert.equal(requested,false);assert.equal(ctx.selectedCompanyRef.current,'a');assert.equal(ctx.noteDirtyRef.current,true);
});


test('admin: note stays protected while save and live refresh overlap',async()=>{
  let resolveSave,note='Draft';
  const ctx=context({detail:{id:'a'},note,selectedCompanyId:'a',selectedCompanyRef:{current:'a'},setNote:value=>{note=value;},supabase:{rpc:async name=>name==='admin_save_company_note'?new Promise(resolve=>{resolveSave=resolve;}):{data:name==='admin_company_detail'?{id:'a',note:'Old'}:[],error:null}}});
  load(ctx,'saveNote');load(ctx,'refreshAdminData');
  const saving=ctx.saveNote();await ctx.refreshAdminData();
  assert.equal(note,'Draft');assert.equal(ctx.noteDirtyRef.current,true);
  resolveSave({error:null});await saving;
  assert.equal(ctx.noteDirtyRef.current,false);
});

test('admin: edits made during save remain dirty and duplicate saves are ignored',async()=>{
  let resolveSave,calls=0;
  const ctx=context({detail:{id:'a'},note:'First',selectedCompanyRef:{current:'a'},supabase:{rpc:()=>{calls++;return new Promise(resolve=>{resolveSave=resolve;});}}});load(ctx,'saveNote');
  const saving=ctx.saveNote();await ctx.saveNote();
  ctx.noteRevisionRef.current++;ctx.note='New draft';
  resolveSave({error:null});await saving;
  assert.equal(calls,1);assert.equal(ctx.noteDirtyRef.current,true);assert.equal(ctx.noteSaveLockRef.current,false);
});

test('admin: failed save from previous company does not mark the new company dirty',async()=>{
  let resolveSave,error='';
  const ctx=context({detail:{id:'a'},note:'Draft',selectedCompanyRef:{current:'a'},setDetailError:value=>{error=value;},supabase:{rpc:()=>new Promise(resolve=>{resolveSave=resolve;})}});load(ctx,'saveNote');
  const saving=ctx.saveNote();ctx.selectedCompanyRef.current='b';ctx.noteRevisionRef.current++;ctx.noteDirtyRef.current=false;
  resolveSave({error:new Error('Failed A')});await saving;
  assert.equal(error,'');assert.equal(ctx.noteDirtyRef.current,false);
});

test('admin: refresh started before save acknowledgement cannot restore an old note',async()=>{
  let resolveSave,resolveDetail,note='Draft';
  const ctx=context({detail:{id:'a'},note,selectedCompanyId:'a',selectedCompanyRef:{current:'a'},setNote:value=>{note=value;},supabase:{rpc:async name=>name==='admin_save_company_note'?new Promise(resolve=>{resolveSave=resolve;}):name==='admin_company_detail'?new Promise(resolve=>{resolveDetail=resolve;}):{data:[],error:null}}});
  load(ctx,'saveNote');load(ctx,'refreshAdminData');
  const saving=ctx.saveNote(),refreshing=ctx.refreshAdminData();
  await new Promise(resolve=>setImmediate(resolve));
  resolveSave({error:null});await saving;
  resolveDetail({data:{id:'a',note:'Old'},error:null});await refreshing;
  assert.equal(note,'Draft');assert.equal(ctx.noteDirtyRef.current,false);
});
