import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../src/OrbitCord.App/Scripts/orbitcord-settings.js', import.meta.url), 'utf8');
const webviewListeners = [];
const posts = [];
function element(tag='div'){return {tagName:tag.toUpperCase(),style:{},dataset:{},children:[],parentElement:null,append(...xs){for(const x of xs){if(x&&typeof x==='object')x.parentElement=this;this.children.push(x)}},appendChild(x){this.append(x);return x},replaceChildren(...xs){this.children=[];this.append(...xs)},addEventListener(){},remove(){},querySelector(){return null},querySelectorAll(){return[]},closest(){return null},matches(){return false},contains(){return false},getBoundingClientRect(){return{left:0,right:800,top:0,bottom:600,width:800,height:600}},set textContent(v){this._text=String(v??'')},get textContent(){return this._text||''}}}
const page=element();page.id='orbitcord-shortcut-page';const host=element();host.id='orbitcord-settings-panel-host';host.append(page);const body=element('body');body.append(host);
const document={body,createElement:element,createTextNode:t=>({textContent:String(t)}),getElementById(id){if(id===page.id)return page;if(id===host.id)return host;return null},querySelector(){return null},querySelectorAll(){return[]},addEventListener(){}};
const webview={postMessage(p){posts.push(p)},addEventListener(t,cb){if(t==='message')webviewListeners.push(cb)}};
const windowObj={chrome:{webview},document,innerWidth:1000,innerHeight:700,addEventListener(){},dispatchEvent(){}};
vm.runInContext(source,vm.createContext({window:windowObj,document,chrome:windowObj.chrome,console,setTimeout,clearTimeout,crypto:{randomUUID:()=> 'draft-id'},Date,Math,Object,Array,Set,Map,String,Number,RegExp,Symbol,JSON,CustomEvent:function(){}}));
const send=data=>webviewListeners.forEach(cb=>cb({data}));
const actions=[{id:'TOGGLE_DEAFEN',name:'Deafen',description:'',isHold:false}];
send({type:'orbitcord-shortcuts-state',revision:1,hookRunning:true,actions,bindings:[{id:'saved-id',action:'TOGGLE_DEAFEN',virtualKeys:[17,18,68],enabled:true,chord:'Ctrl + Alt + D'}]});
windowObj.__orbitcordSettingsTest.startRecordingForTest('saved-id');
assert.equal(posts.some(p=>p?.type==='orbitcord-shortcut-recording-begin'&&p.id==='saved-id'),true,'recording must be native');
send({type:'orbitcord-shortcut-recording-state',active:true,id:'saved-id'});
send({type:'orbitcord-shortcut-recording-preview',id:'saved-id',virtualKeys:[78],chord:'N'});
assert.deepEqual(Array.from(windowObj.__orbitcordSettingsTest.getBindingsForTest()[0].virtualKeys),[17,18,68],'preview cannot overwrite persisted chord');
send({type:'orbitcord-shortcut-recording-state',active:false,id:null});
send({type:'orbitcord-shortcuts-state',revision:2,hookRunning:true,actions,bindings:[{id:'saved-id',action:'TOGGLE_DEAFEN',virtualKeys:[78],enabled:true,chord:'N'}]});
assert.deepEqual(Array.from(windowObj.__orbitcordSettingsTest.getBindingsForTest()[0].virtualKeys),[78],'single N must be accepted with no modifier requirement');
console.log('shortcut-recording-flexible-chord: PASS');
