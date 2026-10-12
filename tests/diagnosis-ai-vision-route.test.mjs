import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const JS = ts.transpileModule(readFileSync("app/api/ai/diagnosis/route.ts","utf8"), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const companyId="a8000000-0000-4000-8000-000000000001";
const orderId="a8000000-0000-4000-8000-000000000002";
const photoId="a8000000-0000-4000-8000-000000000003";
const userId="a8000000-0000-4000-8000-000000000004";

function harness({authenticated=true,role="TECHNICIAN",enabled=false,paid=false,photoCompany=companyId,reserve=true}={}){
  const db=[],provider=[],service=[],storage=[];
  const order={id:orderId,empresa_id:companyId,problema:"Tela quebrada",equipamento_id:photoId};
  const photo={id:photoId,empresa_id:photoCompany,ordem_id:orderId,
    caminho:companyId+"/"+orderId+"/equipe/arquivo.jpg",categoria:"Entrada",descricao:""};
  function builder(table){
    const filters={};
    const q={
      select:()=>q,
      eq:(k,v)=>{filters[k]=v;return q;},
      maybeSingle:async()=>{
        db.push([table,filters]);
        return {data:table==="ordens_servico"&&filters.empresa_id===companyId?order:null,error:null};
      },
      in:async()=>{
        db.push([table,filters]);
        return {data:table==="fotos_os"&&photoCompany===filters.empresa_id?[photo]:[],error:null};
      },
    };
    return q;
  }
  const client={
    from:builder,
    storage:{from:()=>({
      download:async(path)=>{
        storage.push(path);
        return {data:new Blob([new Uint8Array(512)],{type:"image/jpeg"}),error:null};
      },
    })},
  };
  const access=authenticated?{
    user:{id:userId},
    context:{
      globalMaintenance:false,
      company:{id:companyId,role,status:"ACTIVE",maintenance:false,featureFlags:{aiEnabled:enabled}},
    },
    client,
  }:null;
  const exports={};
  vm.runInNewContext(JS,{
    exports, Request, Response, URL, Buffer, Blob,
    process:{env:{
      NEXT_PUBLIC_SUPABASE_URL:"https://isolated.invalid",
      SUPABASE_SERVICE_ROLE_KEY:"test-secret",
      HORARIA_AI_PAID_ENABLED:paid?"true":"false",
      HORARIA_OPENAI_API_KEY:paid?"not-real":""
    }},
    require(name){
      if(name==="next/server")return {NextResponse:{json:(p,o)=>Response.json(p,o)}};
      if(name==="@/lib/server-auth")return {getServerAccess:async()=>access};
      if(name==="@/lib/diagnosis-vision-provider")
        return {analyzeRepairPhotos:async(args)=>{
          provider.push(args);
          return "SINAIS VISÍVEIS: trinca possível. TESTES: conferir touch.";
        }};
      if(name==="@supabase/supabase-js")return {createClient:()=>({
        rpc:async(name,payload)=>{
          service.push([name,payload]);
          if(name==="ai_reserve_message")return reserve?{data:"reserved-id",error:null}:{data:null,error:{message:"Sem créditos"}};
          if(name==="ai_finalize_message")return {data:true,error:null};
          throw Error("Unexpected RPC "+name);
        },
      })};
      throw Error("Unexpected import "+name);
    },
  });
  const send=(override={})=>{
    const body={ordemId:orderId,photoIds:[photoId],notes:"Trinca na lateral",consent:true,...override};
    return exports.POST(new Request("https://isolated.invalid/api/ai/diagnosis",{
      method:"POST",headers:{"content-type":"application/json",origin:"https://isolated.invalid"},
      body:JSON.stringify(body),
    }));
  };
  return {send,db,provider,service,storage};
}

test("Diagnóstico IA: sessão obrigatória, técnico autorizado e consentimento expresso",async()=>{
  assert.equal((await harness({authenticated:false}).send()).status,401);
  assert.equal((await harness({role:"ATTENDANT"}).send()).status,403);
  const h=harness();
  assert.equal((await h.send({consent:false})).status,400);
  assert.equal((await h.send({photoIds:["arquivo.jpg"]})).status,400);
  assert.equal(h.provider.length,0);
  assert.equal(h.service.length,0);
});

test("Diagnóstico IA: valida foto pela empresa e OS antes da carteira",async()=>{
  const h=harness({enabled:true,paid:true,photoCompany:"a8000000-0000-4000-8000-000000000099"});
  assert.equal((await h.send()).status,403);
  assert.equal(h.storage.length,0);
  assert.equal(h.service.length,0);
  assert.equal(h.provider.length,0);
});

test("Diagnóstico IA: sem licença ou saldo, nunca faz chamada externa",async()=>{
  const disabled=harness();
  assert.equal((await disabled.send()).status,403);
  const off=harness({enabled:true});
  assert.equal((await off.send()).status,503);
  const noCredits=harness({enabled:true,paid:true,reserve:false});
  assert.equal((await noCredits.send()).status,402);
  assert.equal(noCredits.provider.length,0);
  assert.ok(noCredits.service.some(x=>x[0]==="ai_reserve_message"));
});

test("Diagnóstico IA: imagem privada, reserva, análise e liquidação com revisão técnica",async()=>{
  const h=harness({enabled:true,paid:true,reserve:true});
  const response=await h.send();
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.requiresTechnicianReview,true);
  assert.equal(result.creditUnits,1);
  assert.equal(h.storage.length,1);
  assert.equal(h.provider.length,1);
  assert.ok(h.provider[0].images[0].bytes.byteLength>256);
  assert.deepEqual(h.service.map(x=>x[0]),["ai_reserve_message","ai_finalize_message"]);
  assert.equal(h.service[1][1].p_success,true);
});
