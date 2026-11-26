import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LayoutExplodedController, type ExplodeLevel, type ExplodeState } from "./ExplodeLayout";
import { KNOWLEDGE, SYSTEM_KNOWLEDGE, SOURCES, type StructureKnowledge } from "./Knowledge";

const decode=(s:string):ArrayBuffer=>{const b=atob(s);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer};
const GROUPS:Record<string,string>={
 Myocardium:"心肌",Chambers:"心腔",Valves:"瓣膜",PapillaryMuscles:"乳头肌",GreatVessels:"大血管",CoronaryArteries:"冠状动脉"
};
const LABELS:Record<string,string>={
 heart_left_atrium:"左心房",heart_right_atrium:"右心房",heart_left_ventricle:"左心室腔",heart_right_ventricle:"右心室腔",
 heart_left_ventricular_wall:"左心室壁",heart_right_ventricular_wall:"右心室壁",heart_interventricular_septum:"室间隔",
 heart_mitral_anterior_leaflet:"二尖瓣前瓣",heart_mitral_posterior_leaflet:"二尖瓣后瓣",heart_mitral_annulus:"二尖瓣环",heart_mitral_chordae:"二尖瓣腱索",
 heart_anterolateral_papillary_muscle:"前外侧乳头肌",heart_posteromedial_papillary_muscle:"后内侧乳头肌",
 heart_tricuspid_anterior_leaflet:"三尖瓣前瓣",heart_tricuspid_posterior_leaflet:"三尖瓣后瓣",heart_tricuspid_septal_leaflet:"三尖瓣隔瓣",heart_tricuspid_annulus:"三尖瓣环",heart_tricuspid_chordae:"三尖瓣腱索",
 heart_tricuspid_anterior_papillary:"三尖瓣前乳头肌",heart_tricuspid_posterior_papillary:"三尖瓣后乳头肌",heart_tricuspid_septal_papillary:"三尖瓣隔乳头肌",
 heart_aortic_left_cusp:"主动脉瓣左冠瓣",heart_aortic_right_cusp:"主动脉瓣右冠瓣",heart_aortic_noncoronary_cusp:"主动脉瓣无冠瓣",heart_aortic_annulus:"主动脉瓣环",
 heart_pulmonary_left_cusp:"肺动脉瓣左瓣",heart_pulmonary_right_cusp:"肺动脉瓣右瓣",heart_pulmonary_anterior_cusp:"肺动脉瓣前瓣",heart_pulmonary_annulus:"肺动脉瓣环",
 heart_aorta:"主动脉",heart_pulmonary_trunk:"肺动脉干",heart_left_pulmonary_artery:"左肺动脉",heart_right_pulmonary_artery:"右肺动脉",
 heart_superior_vena_cava:"上腔静脉",heart_inferior_vena_cava:"下腔静脉",heart_left_superior_pulmonary_vein:"左上肺静脉",heart_left_inferior_pulmonary_vein:"左下肺静脉",heart_right_superior_pulmonary_vein:"右上肺静脉",heart_right_inferior_pulmonary_vein:"右下肺静脉",
 heart_left_coronary_artery:"左冠状动脉主干",heart_lad:"LAD",heart_lcx:"LCX",heart_right_coronary_artery:"右冠状动脉主干",heart_pda:"RCA 后室间支",heart_marginal_branch:"RCA 边缘支",heart_diagonal_branch:"LAD 对角支",heart_rca_first_anterior_branch:"RCA 前室支",
};
const canvas=document.getElementById("viewer") as HTMLCanvasElement;
const stage=document.getElementById("stage") as HTMLElement;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(stage.clientWidth,stage.clientHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.setClearColor(0x06111d,1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x06111d);
const camera=new THREE.PerspectiveCamera(32,stage.clientWidth/stage.clientHeight,.05,1000);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.07;
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.add(new THREE.AmbientLight(0xd0e0ed,.18));scene.add(camera);const lightRig=new THREE.Group();lightRig.name="ScreenFixedTopLeftRig";camera.add(lightRig);
const key=new THREE.SpotLight(0xffead8,340,95,.66,.60,1.12);key.position.set(-10,14,-2);key.target.position.set(6,-4,-10);lightRig.add(key);lightRig.add(key.target);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.near=.5;key.shadow.camera.far=90;key.shadow.bias=-.0002;key.shadow.normalBias=.02;
const fill=new THREE.DirectionalLight(0xa9d6f5,.50);fill.position.set(10,4,-2);fill.target.position.set(-6,-2,-10);lightRig.add(fill);lightRig.add(fill.target);
const rim=new THREE.DirectionalLight(0x7cc9ff,1.0);rim.position.set(0,6,8);rim.target.position.set(0,0,-10);lightRig.add(rim);lightRig.add(rim.target);
scene.add(new THREE.HemisphereLight(0x3d5a70,0x1b1412,.22));
let root:THREE.Group,meshes:THREE.Mesh[]=[],selected:THREE.Mesh|null=null;let selectionOutline:THREE.BoxHelper|null=null;let internalRoot:THREE.Group|null=null;const internalMeshes:THREE.Mesh[]=[];let flowGroup:THREE.Group|null=null;const flowDots:{mesh:THREE.Mesh;curve:THREE.CatmullRomCurve3}[]=[];let chambersActive=false;const CHAMBER_CENTERS:Record<string,THREE.Vector3>={la:new THREE.Vector3(-0.71,1.86,-2.94),ra:new THREE.Vector3(-4.3,1.34,-0.7),lv:new THREE.Vector3(1.37,-0.42,-0.91),rv:new THREE.Vector3(-1.03,-0.26,1.74)};const WALLS=new Set(["heart_left_ventricular_wall","heart_right_ventricular_wall","heart_left_atrium","heart_right_atrium","heart_left_atrial_appendage","heart_right_atrial_appendage"]);
let explode:LayoutExplodedController|null=null,explodeActive=false;
const statusEl=document.getElementById("status") as HTMLElement;const listEl=document.getElementById("list") as HTMLElement;const selName=document.getElementById("selName") as HTMLElement;const selCn=document.getElementById("selCn") as HTMLElement;const selDesc=document.getElementById("selDesc") as HTMLElement;const eduEl=document.getElementById("edu") as HTMLElement;
const OUTER=new Set(["heart_left_ventricular_wall","heart_right_ventricular_wall","heart_interventricular_septum","heart_left_atrium","heart_right_atrium","heart_left_atrial_appendage","heart_right_atrial_appendage","heart_interatrial_septum"]);
const CHAMBERS=new Set(["heart_left_ventricle","heart_right_ventricle","heart_left_atrial_cavity","heart_right_atrial_cavity"]);
const CAVITIES=new Set(["heart_left_ventricle","heart_right_ventricle","heart_left_atrial_cavity","heart_right_atrial_cavity"]);
const ATRIAL_CAVITIES=new Set(["heart_left_atrial_cavity","heart_right_atrial_cavity"]);
function setMatOpacity(m:THREE.Mesh,level:number,t:boolean,side:THREE.Side=THREE.DoubleSide){const ms=Array.isArray(m.material)?m.material:[m.material];for(const mat of ms){mat.transparent=t;mat.opacity=level;mat.depthWrite=!t;mat.side=side;mat.needsUpdate=true;}}
function groupOf(n:string){return Object.entries(GROUPS).find(([k])=>n.startsWith('heart_')&&false)?.[0]??n;}
function groupName(n:string){if(n==='heart_interatrial_septum'||n==='heart_left_atrial_appendage'||n==='heart_right_atrial_appendage'||n==='heart_left_atrial_cavity'||n==='heart_right_atrial_cavity')return 'Chambers';if(n==='heart_descending_thoracic_aorta'||n==='heart_brachiocephalic_trunk'||n==='heart_left_common_carotid'||n==='heart_left_subclavian'||n==='heart_brachiocephalic_vein_confluence')return 'GreatVessels';if(n==='heart_coronary_obtuse_marginal_branch')return 'CoronaryArteries';if(n.includes('papillary'))return 'PapillaryMuscles';if(n.includes('wall')||n.includes('septum'))return 'Myocardium';if(n.includes('leaflet')||n.includes('cusp')||n.includes('annulus')||n.includes('chordae'))return 'Valves';if(n.includes('coronary')||n==='heart_lad'||n==='heart_lcx'||n.includes('pda')||n.includes('marginal')||n.includes('diagonal')||n.includes('rca_first'))return 'CoronaryArteries';if(n.includes('atrium')||n.includes('ventricle'))return 'Chambers';return 'GreatVessels';}
function buildList(){const groups=new Map<string,THREE.Mesh[]>();for(const m of meshes){const g=groupName(m.name);if(!groups.has(g))groups.set(g,[]);groups.get(g)!.push(m);}for(const [g,ms] of groups){const sec=document.createElement("div");sec.className="section group-section";sec.dataset.group=g;const head=document.createElement("div");head.className="group-head";const h=document.createElement("h2");h.textContent=GROUPS[g]??g;const count=document.createElement("span");count.className="group-count";count.dataset.groupCount=g;const acts=document.createElement("div");acts.className="group-actions";const all=document.createElement("button");all.type="button";all.textContent="全选";all.dataset.groupAll=g;const off=document.createElement("button");off.type="button";off.textContent="全关";off.dataset.groupOff=g;acts.append(all,off);head.append(h,count,acts);sec.appendChild(head);for(const m of ms){const row=document.createElement("div");row.className="row";row.dataset.row=m.name;const cb=document.createElement("input");cb.type="checkbox";cb.checked=true;cb.dataset.group=g;cb.addEventListener("change",()=>{m.visible=cb.checked;if(!cb.checked&&selected===m)select(null);updateGroupCounts();});const dot=document.createElement("span");dot.className="dot";dot.style.setProperty("--dot",g==="Valves"?"#f2e8d5":g==="CoronaryArteries"?"#b23a40":g==="GreatVessels"?"#5b6f8b":g==="Myocardium"?"#8f3b42":"#b9656d");const btn=document.createElement("button");btn.type="button";btn.dataset.name=m.name;btn.dataset.search=`${LABELS[m.name]??m.name} ${KNOWLEDGE[m.name]?.nameEn??""} ${m.name}`.toLowerCase();btn.textContent=LABELS[m.name]??m.name;btn.addEventListener("click",()=>select(m));row.append(cb,dot,btn);sec.appendChild(row);}listEl.appendChild(sec);}updateGroupCounts();}
function setGroupVisible(g:string,v:boolean){for(const m of meshes)if(groupName(m.name)===g)m.visible=v;listEl.querySelectorAll(`input[data-group="${g}"]`).forEach((x:any)=>{x.checked=v;});if(!v&&selected&&groupName(selected.name)===g)select(null);updateGroupCounts();}
let currentK:StructureKnowledge|null=null;let kTab:"overview"|"anatomy"|"clinical"|"quiz"="overview";
function kEsc(x:string){return x.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c] as string));}
function kChips(k:StructureKnowledge){return k.related.map(id=>`<button class="chip" data-know-id="${kEsc(id)}">${kEsc(KNOWLEDGE[id]?.nameZh??id)}</button>`).join("");}
function renderKTab(){if(!currentK)return;const k=currentK;const body=document.getElementById("knowBody");if(!body)return;let h="";
 if(kTab==="overview"){h=`<div class="edu-row"><span>位置</span><p>${kEsc(k.location)}</p></div><div class="edu-row"><span>功能</span><p>${kEsc(k.function)}</p></div><div class="edu-row"><span>关系</span><p>${kChips(k)}</p></div><div class="edu-row"><span>记忆</span><p>${kEsc(k.memoryTip)}</p></div>`;}
 else if(kTab==="anatomy"){h=`<div class="edu-row"><span>形态</span><p>${kEsc(k.shape)}</p></div><div class="edu-row"><span>毗邻</span><p>${k.relations.map(kEsc).join("；")}</p></div><div class="edu-row"><span>观察</span><p>${kEsc(k.imaging)}</p></div><div class="edu-row"><span>易错</span><p>${k.pitfalls.map(kEsc).join("；")}</p></div>`;}
 else if(kTab==="clinical"){h=`<div class="edu-row"><span>临床</span><p>${k.clinical.map(x=>"• "+kEsc(x)).join("<br>")}</p></div><div class="edu-row"><span>目标</span><p>${k.objectives.map(x=>"• "+kEsc(x)).join("<br>")}</p></div>`;}
 else {h=k.quiz.map((q,i)=>`<div class="quiz"><b>Q${i+1}. ${kEsc(q.q)}</b><details><summary>查看答案</summary><p>${kEsc(q.a)}</p></details></div>`).join("");}
 body.innerHTML=h;document.querySelectorAll("[data-ktab]").forEach(b=>b.classList.toggle("on",(b as HTMLElement).dataset.ktab===kTab));}
function renderKnowledge(k:StructureKnowledge|null){currentK=k;if(!k){eduEl.innerHTML="";return;}const tabs:[string,string][]=[["overview","概览"],["anatomy","解剖"],["clinical","临床"],["quiz","自测"]];eduEl.innerHTML=`<div class="know-tabs">${tabs.map(([id,label])=>`<button data-ktab="${id}" class="${id===kTab?"on":""}">${label}</button>`).join("")}</div><div id="knowBody"></div><button id="knowFull" class="full-link">展开完整知识卡</button>`;renderKTab();}
function openFullCard(k:StructureKnowledge|null){if(!k)return;const modal=document.getElementById("knowModal") as HTMLElement;const title=document.getElementById("knowModalTitle") as HTMLElement;const body=document.getElementById("knowModalBody") as HTMLElement;if(!modal)return;title.textContent=`${k.nameZh} · ${k.nameEn}`;body.innerHTML=`<div class="know-kicker">${kEsc(k.system)} · ${kEsc(k.id)}</div><h3>${kEsc(k.nameZh)}</h3><p class="know-lead">${kEsc(k.function)}</p><h4>解剖定位</h4><p>${kEsc(k.location)}</p><p>${kEsc(k.shape)}</p><h4>毗邻关系</h4><ul>${k.relations.map(x=>`<li>${kEsc(x)}</li>`).join("")}</ul><h4>临床关联</h4><ul>${k.clinical.map(x=>`<li>${kEsc(x)}</li>`).join("")}</ul><h4>观察与影像</h4><p>${kEsc(k.imaging)}</p><h4>学习目标</h4><ul>${k.objectives.map(x=>`<li>${kEsc(x)}</li>`).join("")}</ul><h4>易错点</h4><ul>${k.pitfalls.map(x=>`<li>${kEsc(x)}</li>`).join("")}</ul><h4>自测</h4>${k.quiz.map((q,i)=>`<div class="quiz"><b>Q${i+1}. ${kEsc(q.q)}</b><details><summary>查看答案</summary><p>${kEsc(q.a)}</p></details></div>`).join("")}<h4>关联结构</h4><p>${kChips(k)}</p><h4>参考来源</h4><ul>${k.sources.map(id=>`<li>${kEsc(SOURCES[id]?.label??id)}</li>`).join("")}</ul><p class="disclaimer">教学示意，不替代临床诊断。</p>`;modal.hidden=false;}
function select(mesh:THREE.Mesh|null){if(selectionOutline){scene.remove(selectionOutline);selectionOutline.geometry.dispose();(selectionOutline.material as THREE.Material).dispose();selectionOutline=null;}if(selected){const oldMats=Array.isArray(selected.material)?selected.material:[selected.material];for(const m of oldMats)if(m instanceof THREE.MeshStandardMaterial){m.emissive.setHex(0);m.emissiveIntensity=0;}}selected=mesh;
 if(mesh){const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of mats)if(m instanceof THREE.MeshStandardMaterial){m.emissive.setHex(0x5c2a00);m.emissiveIntensity=.85;}selectionOutline=new THREE.BoxHelper(mesh,0x8ff3ff);(selectionOutline.material as THREE.LineBasicMaterial).transparent=true;(selectionOutline.material as THREE.LineBasicMaterial).opacity=.9;(selectionOutline.material as THREE.LineBasicMaterial).depthTest=false;selectionOutline.renderOrder=30;scene.add(selectionOutline);const k=KNOWLEDGE[mesh.name];selName.textContent=k?.nameZh??(LABELS[mesh.name]??mesh.name);selCn.textContent=`${k?.system??GROUPS[groupName(mesh.name)]??""} · ${mesh.name}`;selDesc.textContent=k?.function??"独立 Mesh；可选择、隐藏、隔离、参与爆炸。";renderKnowledge(k??null);}
 else{selName.textContent="—";selCn.textContent="选择结构";selDesc.textContent="左侧结构索引或直接点击模型。";renderKnowledge(null);}
 document.querySelectorAll("#list button[data-name]").forEach(b=>b.classList.toggle("active",(b as HTMLElement).dataset.name===mesh?.name));}
function selectById(id:string){const m=meshes.find(x=>x.name===id);if(m)select(m);return !!m;}
function updateGroupCounts(){const counts=new Map<string,[number,number]>();for(const m of meshes){const g=groupName(m.name);const a=counts.get(g)??[0,0];a[1]++;if(m.visible)a[0]++;counts.set(g,a);}document.querySelectorAll("[data-group-count]").forEach(el=>{const g=(el as HTMLElement).dataset.groupCount!;const a=counts.get(g)??[0,0];el.textContent=`${a[0]}/${a[1]}`;});}
function isolate(){if(!selected)return;for(const m of meshes)m.visible=m===selected;selected.visible=true;frame(new THREE.Box3().setFromObject(selected),[.4,.25,1],.55);}
function applyTransparent(level:number){for(const m of meshes){if(OUTER.has(m.name)||CHAMBERS.has(m.name))setMatOpacity(m,level,level<1);if(ATRIAL_CAVITIES.has(m.name)&&level<.999)m.visible=true;}}
function frame(box:THREE.Box3,dir:[number,number,number],pad=.82){if(box.isEmpty())return;const c=box.getCenter(new THREE.Vector3());const sph=new THREE.Sphere();box.getBoundingSphere(sph);const d=sph.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*pad;camera.position.copy(c).addScaledVector(new THREE.Vector3(...dir).normalize(),d);controls.target.copy(c);controls.update();}
let sectionOn=false;let sectionPlane:THREE.Plane|null=null;
function applySection(on:boolean){sectionOn=on;if(!root)return;if(on){clipEnabled=false;if(clipCap){scene.remove(clipCap);clipCap.traverse((o:any)=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});clipCap=null;}document.querySelectorAll("[data-clip]").forEach(x=>x.classList.remove("on"));const off=document.querySelector('[data-clip="off"]');if(off)off.classList.add("on");}const box=new THREE.Box3().setFromObject(root);const size=box.getSize(new THREE.Vector3());const z=box.max.z-size.z*.28;sectionPlane=on?new THREE.Plane(new THREE.Vector3(0,0,-1),z):null;for(const m of meshes){const mats=Array.isArray(m.material)?m.material:[m.material];for(const mt of mats){mt.clippingPlanes=on?[sectionPlane!]:(clipEnabled?[clipPlane]:null);mt.clipShadows=true;mt.needsUpdate=true;}}}
function buildFlow(){flowGroup=new THREE.Group();flowGroup.name="FourChamberFlow";flowGroup.visible=false;scene.add(flowGroup);const paths:[string,THREE.Vector3[]][]=[
 ["blue",[new THREE.Vector3(-4.4,5.2,-1.0),new THREE.Vector3(-4.3,2.5,-1.1),CHAMBER_CENTERS.ra]],
 ["blue",[new THREE.Vector3(-4.2,-4.5,-0.7),new THREE.Vector3(-4.1,-1.4,-0.8),CHAMBER_CENTERS.ra]],
 ["blue",[CHAMBER_CENTERS.ra,new THREE.Vector3(-2.7,0.8,0.2),CHAMBER_CENTERS.rv]],
 ["blue",[CHAMBER_CENTERS.rv,new THREE.Vector3(-0.7,1.2,1.7),new THREE.Vector3(-1.0,4.4,1.5)]],
 ["red",[new THREE.Vector3(0.8,2.8,-3.6),new THREE.Vector3(0.2,2.6,-3.3),CHAMBER_CENTERS.la]],
 ["red",[CHAMBER_CENTERS.la,new THREE.Vector3(-0.2,0.6,-2.2),CHAMBER_CENTERS.lv]],
 ["red",[CHAMBER_CENTERS.lv,new THREE.Vector3(1.5,2.6,-0.9),new THREE.Vector3(1.2,4.8,-0.4)]]
 ];for(const [kind,pts] of paths){const curve=new THREE.CatmullRomCurve3(pts);const mat=new THREE.MeshBasicMaterial({color:kind==="blue"?0x6fa8ff:0xff6b6b,transparent:true,opacity:.78,depthWrite:false});const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,40,.045,6,false),mat);tube.renderOrder=14;flowGroup.add(tube);const dot=new THREE.Mesh(new THREE.SphereGeometry(.10,12,8),mat);flowGroup.add(dot);flowDots.push({mesh:dot,curve});}}
function updateChamberLabels(){const el=document.getElementById("chamberLabels") as HTMLElement;if(!el)return;if(!chambersActive){el.hidden=true;return;}el.hidden=false;const w=stage.clientWidth,h=stage.clientHeight;for(const [id,pos] of Object.entries(CHAMBER_CENTERS)){const v=root.localToWorld(pos.clone()).project(camera);const x=(v.x*.5+.5)*w,y=(-v.y*.5+.5)*h;const node=el.querySelector(`[data-chamber="${id}"]`) as HTMLElement;if(node){node.style.left=`${x}px`;node.style.top=`${y}px`;node.style.opacity=v.z>1?"0.15":"1";}}}
function setInternal(visible:boolean){if(internalRoot)internalRoot.visible=visible;if(visible){for(const m of internalMeshes){const mats=Array.isArray(m.material)?m.material:[m.material];for(const mt of mats){mt.transparent=true;mt.opacity=.26;mt.depthWrite=false;mt.side=THREE.BackSide;mt.needsUpdate=true;}}}}
function visibleBox(){const box=new THREE.Box3();for(const m of [...meshes,...internalMeshes])if(m.visible)box.expandByObject(m);return box;}
function setView(name:string){
 chambersActive=false;const flowEl=document.getElementById("chamberLabels") as HTMLElement;if(flowEl)flowEl.hidden=true;if(flowGroup)flowGroup.visible=false;
 if(selected)select(null);
 if(explodeActive&&name!=="exploded"){explode?.dispose();explode=null;explodeActive=false;}
 if(name==="chambers"){applyTransparent(1);for(const m of meshes){const g=groupName(m.name);m.visible=!WALLS.has(m.name)&&g!=="GreatVessels"&&g!=="CoronaryArteries";if(CAVITIES.has(m.name))setMatOpacity(m,.55,true);}setInternal(true);applySection(true);chambersActive=true;if(flowGroup)flowGroup.visible=true;const l=document.getElementById("chamberLabels") as HTMLElement;if(l)l.hidden=false;}
 else if(name==="internal"){applyTransparent(1);for(const m of meshes){m.visible=!WALLS.has(m.name);if(CAVITIES.has(m.name))setMatOpacity(m,.28,true);}setInternal(true);applySection(false);}
 else{for(const m of meshes)m.visible=true;applySection(false);for(const m of meshes)if(ATRIAL_CAVITIES.has(m.name))m.visible=false;setInternal(false);}
 const dirs:Record<string,[number,number,number]>={front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0],top:[0,1,0],chambers:[0,.12,1],reset:[.45,.28,1]};
 const box=visibleBox();if(box.isEmpty())return;const c=box.getCenter(new THREE.Vector3());const sph=new THREE.Sphere();box.getBoundingSphere(sph);const d=sph.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*(name==="chambers"?1.02:.82);camera.position.copy(c).addScaledVector(new THREE.Vector3(...(dirs[name]??dirs.reset)).normalize(),d);controls.target.copy(c);controls.update();
}
function enterExplode(){chambersActive=false;const cl=document.getElementById("chamberLabels") as HTMLElement;if(cl)cl.hidden=true;if(flowGroup)flowGroup.visible=false;select(null);setClip("off");applySection(false);for(const m of meshes)m.visible=true;setInternal(false);for(const m of meshes)if(ATRIAL_CAVITIES.has(m.name))m.visible=true;applyTransparent(1);if(!explode){explode=new LayoutExplodedController(root,camera,scene,(s)=>updateExplode(s));}explodeActive=true;explode.enter();explode.setLevel(1);explode.setProgress(1);explode.frameAll();}
function updateExplode(s:ExplodeState){const pct=Math.round(s.progress*100);(document.getElementById("explodeRange") as HTMLInputElement).value=String(pct);(document.getElementById("explodeOut") as HTMLElement).textContent=`${pct}%`;(document.getElementById("explodeLevelOut") as HTMLElement).textContent=`L${s.level}`;(document.getElementById("explodePause") as HTMLButtonElement).textContent=s.paused?"继续":"暂停";}
function bind(){
 document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{if((b as HTMLElement).dataset.view==="exploded")enterExplode();else setView((b as HTMLElement).dataset.view!);}));
 document.querySelectorAll("[data-level]").forEach(b=>b.addEventListener("click",()=>{const lv=Number((b as HTMLElement).dataset.level) as ExplodeLevel;if(!explode)enterExplode();if(lv===2){if(explode){explode.dispose();explode=null;explodeActive=false;}setView("chambers");(document.getElementById("explodeRange") as HTMLInputElement).value="0";(document.getElementById("explodeOut") as HTMLElement).textContent="0%";(document.getElementById("explodeLevelOut") as HTMLElement).textContent="L2";document.querySelectorAll("[data-level]").forEach(x=>x.classList.toggle("on",(x as HTMLElement).dataset.level==="2"));}else{for(const m of meshes)m.visible=true;setInternal(false);explode?.setLevel(lv);explode?.setProgress(1);explode?.frameAll();}}));
 const r=document.getElementById("explodeRange") as HTMLInputElement;r.addEventListener("input",()=>{if(!explode)enterExplode();explode?.setProgress(Number(r.value)/100);if(Number(r.value)>=99)explode?.frameAll();});
 (document.getElementById("explodePause") as HTMLButtonElement).addEventListener("click",()=>{if(!explode)return;const s=explode.getState();if(s.paused)explode.resume();else explode.pause();});
 (document.getElementById("explodeRestore") as HTMLButtonElement).addEventListener("click",()=>{explode?.restore(false);});
 document.querySelectorAll("[data-speed]").forEach(b=>b.addEventListener("click",()=>explode?.setSpeed(Number((b as HTMLElement).dataset.speed))));
 (document.getElementById("isolateBtn") as HTMLButtonElement).addEventListener("click",()=>{isolate();});
 (document.getElementById("singleBtn") as HTMLButtonElement).addEventListener("click",()=>{if(!selected)return;if(!explode)enterExplode();const target=selected;for(const m of meshes)m.visible=m===target;explode?.focusMesh(target.name);frame(new THREE.Box3().setFromObject(target),[.3,.2,1],.8);});
 (document.getElementById("groupBtn") as HTMLButtonElement).addEventListener("click",()=>{if(!selected)return;if(!explode)enterExplode();const g=groupName(selected.name);for(const m of meshes)m.visible=groupName(m.name)===g;explode?.focusGroup(g);const box=new THREE.Box3();for(const m of meshes)if(m.visible)box.expandByObject(m);frame(box,[.3,.2,1],.85);});
 (document.getElementById("showAllBtn") as HTMLButtonElement).addEventListener("click",()=>{for(const m of meshes)m.visible=true;setView("front");});
 document.querySelectorAll("[data-clip]").forEach(b=>b.addEventListener("click",()=>{const v=(b as HTMLElement).dataset.clip as any;document.querySelectorAll("[data-clip]").forEach(x=>x.classList.toggle("on",x===b));if(v==="off")setClip("off");else setClip(v,Number((document.getElementById("clipRange") as HTMLInputElement).value)/100,(document.getElementById("clipReverse") as HTMLInputElement).checked);}));
 (document.getElementById("clipRange") as HTMLInputElement).addEventListener("input",()=>{if(!clipEnabled)return;setClip(clipAxis,Number((document.getElementById("clipRange") as HTMLInputElement).value)/100,(document.getElementById("clipReverse") as HTMLInputElement).checked);});
 (document.getElementById("clipReverse") as HTMLInputElement).addEventListener("change",()=>{if(clipEnabled)setClip(clipAxis,Number((document.getElementById("clipRange") as HTMLInputElement).value)/100,(document.getElementById("clipReverse") as HTMLInputElement).checked);});
 const levelSel=document.getElementById("opacityLevels") as HTMLElement;levelSel.querySelectorAll("[data-opacity]").forEach(b=>b.addEventListener("click",()=>{const v=Number((b as HTMLElement).dataset.opacity)/100;applyTransparent(v);levelSel.querySelectorAll("[data-opacity]").forEach(x=>x.classList.toggle("on",x===b));}));
 listEl.addEventListener("click",(e)=>{const t=(e.target as HTMLElement);if(t.dataset.groupAll)setGroupVisible(t.dataset.groupAll,true);if(t.dataset.groupOff)setGroupVisible(t.dataset.groupOff,false);});
 eduEl.addEventListener("click",(e)=>{const t=(e.target as HTMLElement);if(t.dataset.ktab){kTab=t.dataset.ktab as any;renderKTab();}if(t.dataset.knowId)selectById(t.dataset.knowId);if(t.id==="knowFull")openFullCard(currentK);});
 document.getElementById("knowModalClose")?.addEventListener("click",()=>{const m=document.getElementById("knowModal") as HTMLElement;if(m)m.hidden=true;});
 const search=document.getElementById("search") as HTMLInputElement;if(search)search.addEventListener("input",()=>{const q=search.value.trim().toLowerCase();document.querySelectorAll("#list .row").forEach((r:any)=>{const b=r.querySelector("button[data-name]");r.hidden=!!q&&!b?.dataset.search.includes(q);});});
}
let pdX=0,pdY=0;
canvas.addEventListener("pointerdown",(e)=>{pdX=e.clientX;pdY=e.clientY;});
canvas.addEventListener("pointerup",(e)=>{if(Math.hypot(e.clientX-pdX,e.clientY-pdY)>6)return;const r=canvas.getBoundingClientRect();const ndc=new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);const hits=ray.intersectObjects(meshes.filter(m=>m.visible),false);if(hits.length)select(hits[0].object as THREE.Mesh);});
let clipEnabled=false,clipAxis:'x'|'y'|'z'='x',clipPos=.5,clipReverse=false;
const clipPlane=new THREE.Plane(new THREE.Vector3(-1,0,0),0); renderer.localClippingEnabled=true;
let clipCap:THREE.Group|null=null;
function buildClipCap(val:number):THREE.Group|null{
 const group=new THREE.Group();
 for(const m of meshes){
  if(!m.visible)continue;
  m.updateMatrixWorld(true);const geo=m.geometry;const pos=geo.attributes.position as THREE.BufferAttribute;const idx=geo.index;
  const triCount=idx?idx.count/3:pos.count/3;const segs:[THREE.Vector3,THREE.Vector3][]=[];const meshPts:THREE.Vector3[]=[];
  for(let t=0;t<triCount;t++){
   const ia=idx?idx.getX(t*3):t*3, ib=idx?idx.getX(t*3+1):t*3+1, ic=idx?idx.getX(t*3+2):t*3+2;
   const a=new THREE.Vector3().fromBufferAttribute(pos,ia).applyMatrix4(m.matrixWorld);
   const b=new THREE.Vector3().fromBufferAttribute(pos,ib).applyMatrix4(m.matrixWorld);
   const c=new THREE.Vector3().fromBufferAttribute(pos,ic).applyMatrix4(m.matrixWorld);
   const da=clipPlane.distanceToPoint(a),db=clipPlane.distanceToPoint(b),dc=clipPlane.distanceToPoint(c);
   const inter=(p:THREE.Vector3,q:THREE.Vector3,dp:number,dq:number)=>{if(dp*dq>0||Math.abs(dp-dq)<1e-12)return null;const u=dp/(dp-dq);return p.clone().lerp(q,u);};
   const ps=[inter(a,b,da,db),inter(b,c,db,dc),inter(c,a,dc,da)].filter(Boolean) as THREE.Vector3[];
   if(ps.length>=2){segs.push([ps[0],ps[1]]);meshPts.push(ps[0],ps[1]);}
  }
  if(segs.length<3)continue;
  const key=(p:THREE.Vector3)=>p.toArray().map(v=>Math.round(v*1e4)/1e4).join(',');
  const ptsMap=new Map<string,THREE.Vector3>(); const adj=new Map<string,string[]>(); const edges=new Set<string>();
  for(const [pa,pb] of segs){const ka=key(pa),kb=key(pb);if(ka===kb)continue;ptsMap.set(ka,pa);ptsMap.set(kb,pb);edges.add(ka+'|'+kb);if(!adj.has(ka))adj.set(ka,[]);if(!adj.has(kb))adj.set(kb,[]);adj.get(ka)!.push(kb);adj.get(kb)!.push(ka);}
  const used=new Set<string>();const loops:string[][]=[];
  for(const e of edges){
   if(used.has(e))continue;const [a0,b0]=e.split('|');let a=a0,b=b0;const loop=[a];used.add(e);let guard=0;
   while(guard++<20000){loop.push(b);if(b===loop[0])break;const ns=adj.get(b)||[];let next=null;for(const n of ns){const e1=b+'|'+n,e2=n+'|'+b;if(!used.has(e1)&&!used.has(e2)){next=n;used.add(e1);used.add(e2);break;}}if(!next)break;a=b;b=next;}
   if(loop.length>=4){if(loop[0]!==loop[loop.length-1])loop.push(loop[0]);loops.push(loop.slice(0,-1));}
  }
  const srcMat=Array.isArray(m.material)?m.material[0]:m.material;const col=(srcMat as any).color?((srcMat as any).color as THREE.Color).clone():new THREE.Color(0x8f3b42);col.multiplyScalar(.85);
  const before=group.children.length;
  for(const loop of loops){
   const verts=loop.map(k=>ptsMap.get(k)!).filter(Boolean);if(verts.length<3)continue;
   let u:number,v:number;if(clipAxis==='x'){u=1;v=2;}else if(clipAxis==='y'){u=0;v=2;}else{u=0;v=1;}
   const contour=verts.map(p=>new THREE.Vector2(p.getComponent(u),p.getComponent(v)));
   let tris:number[][]=[];
   try{tris=THREE.ShapeUtils.triangulateShape(contour,[]);}catch(e){continue;}
   if(!tris.length)continue;
   const cg=new THREE.BufferGeometry().setFromPoints(verts);const ids:number[]=[];for(const t of tris)ids.push(t[0],t[1],t[2]);cg.setIndex(ids);cg.computeVertexNormals();
   const cm=new THREE.MeshStandardMaterial({color:col,roughness:.65,metalness:0,side:THREE.DoubleSide,transparent:false,opacity:1,depthWrite:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
   group.add(new THREE.Mesh(cg,cm));
  }
   }
 return group.children.length?group:null;
}
function updateClip(){
 if(!root)return;
 const box=new THREE.Box3().setFromObject(root);const size=box.getSize(new THREE.Vector3());const min=box.min,max=box.max;
 const val=min[clipAxis]+(max[clipAxis]-min[clipAxis])*clipPos;
 const sign=clipReverse?1:-1;
 clipPlane.normal.set(clipAxis==='x'?sign:0,clipAxis==='y'?sign:0,clipAxis==='z'?sign:0);
 clipPlane.constant=-sign*val;
 for(const m of meshes){const ms=Array.isArray(m.material)?m.material:[m.material];for(const mat of ms){mat.clippingPlanes=clipEnabled?[clipPlane]:null;mat.clipShadows=true;mat.needsUpdate=true;}}
 if(clipCap){scene.remove(clipCap);clipCap.traverse((o:any)=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});clipCap=null;}
 if(!clipEnabled)return;
 clipCap=buildClipCap(val);
 if(clipCap){clipCap.renderOrder=10;scene.add(clipCap);}
}
function setClip(axis:'x'|'y'|'z'|'off',pos=.5,reverse=false){if(selected)select(null);applySection(false);clipAxis=axis==='off'?clipAxis:axis;clipPos=pos;clipReverse=reverse;clipEnabled=axis!=='off';if(document.getElementById("clipOut"))document.getElementById("clipOut")!.textContent=Math.round(pos*100)+"%";document.querySelectorAll("[data-clip]").forEach(x=>x.classList.toggle("on",(x as HTMLElement).dataset.clip===(clipEnabled?clipAxis:"off")));updateClip();}

async function boot(){statusEl.textContent="loading integrated heart…";const gltf=await new GLTFLoader().loadAsync("cardiotwin-heart-web.glb");root=gltf.scene;root.traverse((o:any)=>{if(o.isMesh){
  o.geometry.computeVertexNormals();
  const old=o.material;
  if(true){
   const nm=o.name||'';let baseCol=old?.color?old.color.clone():new THREE.Color(0x8f3b42);
   if(nm.includes('leaflet')||nm.includes('cusp'))baseCol=new THREE.Color('#e8dcc6');
   else if(nm.includes('chordae'))baseCol=new THREE.Color('#ded3bd');
   else if(nm.includes('annulus'))baseCol=new THREE.Color('#cfc6b4');
   else if(nm.includes('atrial_cavity'))baseCol=new THREE.Color('#9a4a4d');
   else if(nm.includes('left_ventricle')||nm.includes('right_ventricle'))baseCol=new THREE.Color('#a04d50');
   else if(nm.includes('papillary'))baseCol=new THREE.Color('#7a2b29');
   else if(nm.includes('wall')||nm.includes('septum'))baseCol=new THREE.Color('#6b2327');
   else if(nm.includes('atrium')||nm.includes('appendage'))baseCol=new THREE.Color('#7c292f');
   else if(nm.includes('aorta')||nm.includes('carotid')||nm.includes('subclavian')||nm.includes('brachiocephalic'))baseCol=new THREE.Color('#72262c');
   else if(nm.includes('pulmonary'))baseCol=new THREE.Color('#4f5b86');
   else if(nm.includes('vena')||nm.includes('brachiocephalic_vein'))baseCol=new THREE.Color('#2f5069');
   else if(nm.includes('pulmonary_vein'))baseCol=new THREE.Color('#744154');
   else if(nm.includes('coronary')||nm.includes('lad')||nm.includes('lcx')||nm.includes('pda'))baseCol=new THREE.Color('#a72f35');
   const m=new THREE.MeshPhysicalMaterial({color:baseCol,map:old?.map??null,normalMap:old?.normalMap??null,roughnessMap:old?.roughnessMap??null,aoMap:old?.aoMap??null,metalness:0,roughness:1,side:THREE.DoubleSide,transparent:false,opacity:1,vertexColors:false});
   const ns=nm.includes('leaflet')||nm.includes('cusp')?.34:nm.includes('chordae')||nm.includes('annulus')?.42:nm.includes('coronary')||nm.includes('lad')||nm.includes('lcx')?.20:nm.includes('artery')||nm.includes('vein')||nm.includes('vena')||nm.includes('aorta')||nm.includes('pulmonary')?.22:.18;m.normalScale.set(ns,ns);
   m.clearcoat=.04;m.clearcoatRoughness=.75;m.sheen=.12;m.sheenRoughness=.7;m.sheenColor=new THREE.Color(0xffd9cf);
   m.envMapIntensity=.35;
   if(m.aoMap&&!o.geometry.attributes.uv2&&o.geometry.attributes.uv)o.geometry.setAttribute('uv2',o.geometry.attributes.uv);
   o.material=m;
  }
  o.castShadow=true;o.receiveShadow=true;o.material.flatShading=false;o.material.needsUpdate=true;meshes.push(o);
 }});scene.add(root);
 const cav=await new GLTFLoader().loadAsync("../working/atrial-cavities.glb");internalRoot=cav.scene;internalRoot.name="InternalCavities";internalRoot.visible=false;internalRoot.traverse((o:any)=>{if(o.isMesh){const isLeft=o.name.includes("left");const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(isLeft?0x5b7fc7:0x58b7a6),transparent:true,opacity:.16,side:THREE.BackSide,depthWrite:false});o.material=mat;o.renderOrder=2;internalMeshes.push(o);}});scene.add(internalRoot);buildFlow();
 buildList();bind();setView("front");statusEl.textContent=`loaded · ${meshes.length} structures · ${meshes.length} formal meshes`;document.getElementById("summary")!.textContent=`${meshes.length} structures · 6 groups · 8 deleted by user`;}
boot().catch(e=>{console.error(e);statusEl.textContent=`LOAD FAILED: ${e.message}`;});
function animate(t=0){requestAnimationFrame(animate);controls.update();explode?.update(1/60);if(selected){const mats=Array.isArray(selected.material)?selected.material:[selected.material];const p=.55+.25*(.5+.5*Math.sin(t*.005));for(const m of mats)if(m instanceof THREE.MeshStandardMaterial)m.emissiveIntensity=p;selectionOutline?.setFromObject(selected);}if(chambersActive){flowDots.forEach((d,i)=>{const u=(t*.00016+i*.14)%1;d.mesh.position.copy(d.curve.getPointAt(u));});updateChamberLabels();}renderer.render(scene,camera);}animate();
new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}).observe(stage);
(window as any).__HEART__={setView,enterExplode,isolate,setClip,restore:()=>explode?.restore(false),units:()=>explode?.getUnits()??[],overlaps:()=>explode?.getAABBOverlaps()??[],explodeState:()=>explode?.getState()??null,get state(){return{structures:meshes.length,visible:meshes.filter(m=>m.visible).length,explode:explodeActive,units:explode?.getUnits().length??0}}};function getGroupState(){const out:Record<string,{visible:number,total:number}>={};for(const m of meshes){const g=groupName(m.name);if(!out[g])out[g]={visible:0,total:0};out[g].total++;if(m.visible)out[g].visible++;}return out;}
window.__HEART__={setView,enterExplode,isolate,setClip,selectById,getKnowledge:(id:string)=>KNOWLEDGE[id]??null,getGroupState,setVisible:(n:string,v:boolean)=>{const m=meshes.find(x=>x.name===n);if(m)m.visible=v;},restore:()=>explode?.restore(false),units:()=>explode?.getUnits()??[],overlaps:()=>explode?.getAABBOverlaps()??[],explodeState:()=>explode?.getState()??null,get state(){return{structures:meshes.length,visible:meshes.filter(m=>m.visible).length,explode:explodeActive,units:explode?.getUnits().length??0}}};
(window as any).__HEART_DEBUG__={setOnly:(n:string)=>{for(const m of meshes)m.visible=m.name===n;}};
(window as any).__HEART_DEBUG__={setOnly:(n:string)=>{for(const m of meshes)m.visible=m.name===n;},pick:(x:number,y:number)=>{const r=new THREE.Raycaster();const ndc=new THREE.Vector2((x/stage.clientWidth)*2-1,-(y/stage.clientHeight)*2+1);r.setFromCamera(ndc,camera);const hits=r.intersectObjects(meshes,false);if(!hits.length)return null;return {name:(hits[0].object as any).name,point:hits[0].point.toArray()};}};
