import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
const require=createRequire(import.meta.url);
for(const name of ['PhotoPicker','GuidedPhotoSequence']) test(`fotos ${name}: somente Câmera/Galeria, câmera abre captura e galeria abre seletor`,()=>{
  const states=[],refs=[],clicks=[];let stateIndex=0,refIndex=0;
  const Camera=()=>null;
  const mocks={
    react:{...React,useState(value){const i=stateIndex++;if(!(i in states))states[i]=value;return [states[i],v=>{states[i]=v}]},useRef(value){const i=refIndex++;return refs[i]||=( {current:value})},useEffect(){},useCallback:fn=>fn},
    './inline-camera':{__esModule:true,default:Camera},'./saved-photo-actions':{__esModule:true,default:()=>null},
    '@/lib/photo-corrections':{},'@/lib/photos':{},'@/lib/assistencia':{photoCategories:[]},'@/lib/supabase':{},'./ui':{ErrorBox:()=>null},'./workspace':{},
  };
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync('components/photos.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:n=>mocks[n]||require(n),URL});
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(c=>nodes(c,predicate))];
  const render=()=>{stateIndex=0;refIndex=0;return exports[name]({value:[],onChange(){},state:{currentIndex:0,skipped:[],resumeIndex:null},onStateChange(){},onComplete(){}})};
  let tree=render();
  refs.forEach((ref,i)=>{ref.current={click(){clicks.push(i)}}});
  const group=nodes(tree,n=>n.props?.className===(name==='PhotoPicker'?'upload-actions':'guided-photo-actions'))[0];
  const buttons=nodes(group,n=>n.type==='button');
  assert.deepEqual(buttons.map(b=>b.props.children),['Câmera','Galeria']);
  buttons[0].props.onClick();
  assert.equal(clicks.length,0,'camera must open webcam UI instead of a notebook file picker');
  tree=render();
  assert.equal(nodes(tree,n=>n.type===Camera).length,1);
  buttons[1].props.onClick();
  assert.equal(clicks.length,1);
});
