import {useEffect,useRef,useState} from "react";
import {AdminFavourites} from "./AdminFavourites.js";
import {version} from "../../package.json";
import * as api from "./api.js";
import {loadAnalytics,readConsent,setConsent,track} from "./analytics.js";
import {emptyLikedMemoriesCopy} from "./copy.js";
import {createDoubleTapRecognizer} from "./double-tap.js";
import {FavouriteButton,useSaveFavourite} from "./FavouriteButton.js";
import {LivePhoto} from "./LivePhoto.js";
import {preloadMediaItem} from "./media-preload.js";
import {ProgressiveImage} from "./ProgressiveImage.js";
import {createSoundtrackMixer,soundtrackLevel,type SoundtrackMixer} from "./soundtrack.js";
import {swipeDirection} from "./swipe.js";
import {WelcomeScreen} from "./WelcomeScreen.js";

function Login({role,onDone}:{role:"family"|"admin";onDone:()=>void}){const[p,setP]=useState("");const[e,setE]=useState(false);return <main className="cover"><div className="login"><div className="star">✦</div><h1>{role==="family"?"Our little moments":"Owner statistics"}</h1><p>{role==="family"?"A small collection of days we never want to forget.":"Private access"}</p><form onSubmit={async event=>{event.preventDefault();setE(false);try{await api.login(role,p);onDone()}catch{setE(true)}}}><input autoFocus type="password" value={p} onChange={e=>setP(e.target.value)} placeholder="Family password" aria-label="Password"/><button>Enter</button>{e&&<p className="error">That password didn’t work.</p>}</form></div></main>}

function soundtrackDuckType(type:"IMAGE"|"VIDEO"|undefined,videoAudioUnlocked:boolean):"IMAGE"|"VIDEO"|undefined{return type==="VIDEO"&&!videoAudioUnlocked?"IMAGE":type}

function ConsentPrompt({id}:{id?:string}){const[c,setC]=useState(readConsent());if(!id||c)return null;const choose=(v:"granted"|"denied")=>{setConsent(v,id);setC(v)};return <aside className="consent"><p>Allow anonymous visit analytics? Photo identities always stay private.</p><button onClick={()=>choose("granted")}>Allow analytics</button><button className="quiet" onClick={()=>choose("denied")}>No thanks</button></aside>}

export function Slideshow({welcomeCopy}:{welcomeCopy:api.WelcomeCopy}){const[list,setList]=useState<api.Playlist|null>(null);const[index,setIndex]=useState(0);const[paused,setPaused]=useState(false);const[muted,setMuted]=useState(false);const[videoAudioUnlocked,setVideoAudioUnlocked]=useState(false);const[controls,setControls]=useState(true);const[starting,setStarting]=useState(false);const[startError,setStartError]=useState(false);const audio=useRef<HTMLAudioElement>(null);const mixer=useRef<SoundtrackMixer|null>(null);const mounted=useRef(false);const startup=useRef(false);const video=useRef<HTMLVideoElement>(null);const swipe=useRef<{pointerId:number;x:number;y:number}|null>(null);const suppressClick=useRef(false);const item=list?.items[index];
 const favourite=useSaveFavourite(item?.id,item?.isFavourite);
 const doubleTap=useRef(createDoubleTapRecognizer());
 useEffect(()=>doubleTap.current.cancel(),[item?.id]);
 useEffect(()=>{if(!item||paused)return;const count=setTimeout(()=>void api.countDisplay(item.impressionToken).catch(()=>{}),2000);const advance=item.type==="IMAGE"?setTimeout(()=>setIndex(i=>(i+1)%list!.items.length),list!.photoDurationMs):undefined;return()=>{clearTimeout(count);if(advance)clearTimeout(advance)}},[item,paused,list]);
 useEffect(()=>{if(!controls)return;const timer=setTimeout(()=>setControls(false),3000);return()=>clearTimeout(timer)},[controls,index]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;mixer.current?.dispose();mixer.current=null}},[]);
 useEffect(()=>{mixer.current?.setTarget(soundtrackLevel(soundtrackDuckType(item?.type,videoAudioUnlocked),muted))},[item?.type,muted,videoAudioUnlocked]);
 useEffect(()=>{if(!list||list.items.length<2)return;return preloadMediaItem(list.items[(index+1)%list.items.length])},[index,list]);
 useEffect(()=>{
  const player=video.current;
  if(item?.type!=="VIDEO"||!player)return;
  if(paused){player.pause();return}
  let active=true;
  let lastPosition=player.currentTime;
  let lastProgress=Date.now();
  // Errors, completion and the watchdog can race; advance this slide only once.
  const advance=()=>{if(!active)return;active=false;move(1)};
  player.addEventListener("error",advance);
  player.addEventListener("ended",advance);
  // A pending play() or stalled stream may never reject or emit an error.
  const watchdog=setInterval(()=>{
   if(player.currentTime!==lastPosition){
    lastPosition=player.currentTime;
    lastProgress=Date.now();
   }else if(Date.now()-lastProgress>=15_000)advance();
  },1000);
  if(player.error||player.ended)advance();
  else void player.play().catch(advance);
  return()=>{
   active=false;
   clearInterval(watchdog);
   player.removeEventListener("error",advance);
   player.removeEventListener("ended",advance);
  };
 },[item,paused]);
 const move=(delta:number)=>{if(list?.items.length)setIndex(i=>(i+delta+list.items.length)%list.items.length)};
 const point=(event:React.PointerEvent<HTMLElement>)=>({pointerId:event.pointerId,x:event.clientX,y:event.clientY});
 const pointerDown=(event:React.PointerEvent<HTMLElement>)=>{
  setVideoAudioUnlocked(true);
  if(!event.isPrimary||event.button>0||(event.target as Element).closest(".controls,.favourite-tools")){swipe.current=null;doubleTap.current.cancel();return}
  doubleTap.current.down(point(event),Date.now());
  swipe.current=event.pointerType==="touch"?point(event):null;
 };
 const pointerUp=(event:React.PointerEvent<HTMLElement>)=>{
  const start=swipe.current;swipe.current=null;
  if(start&&start.pointerId===event.pointerId){
   const direction=swipeDirection(start,point(event));
   if(direction){doubleTap.current.cancel();suppressClick.current=true;window.setTimeout(()=>{suppressClick.current=false},0);setControls(true);move(direction);return}
  }
  if(item&&doubleTap.current.up(point(event),Date.now(),item.id)){void favourite.save();setControls(true)}
 };
 const pointerCancel=()=>{swipe.current=null;doubleTap.current.cancel()};
 const pointerMove=(event:React.PointerEvent<HTMLElement>)=>{doubleTap.current.move(point(event));setControls(true)};
 const revealControls=()=>{setVideoAudioUnlocked(true);if(suppressClick.current){suppressClick.current=false;return}setControls(true)};
 const begin=async()=>{if(startup.current)return;startup.current=true;setStarting(true);setStartError(false);if(audio.current&&!mixer.current)mixer.current=createSoundtrackMixer(audio.current);mixer.current?.setTarget(soundtrackLevel(undefined,muted));void mixer.current?.start();try{const p=await api.createPlaylist();if(!mounted.current)return;mixer.current?.setTarget(soundtrackLevel(soundtrackDuckType(p.items[0]?.type,videoAudioUnlocked),muted));setList(p);track("slideshow_started")}catch{if(!mounted.current)return;mixer.current?.setTarget(0);setStartError(true)}finally{startup.current=false;if(mounted.current)setStarting(false)}};
 const content=!list?<WelcomeScreen copy={welcomeCopy} onBegin={begin} busy={starting} error={startError}/>:!item?<main className="cover"><div className="login"><h1>{emptyLikedMemoriesCopy.title}</h1><p>{emptyLikedMemoriesCopy.detail}</p></div></main>:<main className={`stage ${controls?"controls-visible":""}`} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onPointerMove={pointerMove} onClick={revealControls}>{item.type==="IMAGE"?(item.motionUrl?<LivePhoto key={item.id} item={item} motionUrl={item.motionUrl}/>:<ProgressiveImage key={item.id} item={item}/>):<video ref={video} key={item.id} className="media" src={item.mediaUrl} poster={item.thumbnailUrl} preload="auto" autoPlay={!paused} muted={muted||!videoAudioUnlocked} playsInline/>}<div className="shade"/><FavouriteButton key={`favourite-${item.id}`} {...favourite}/>{item.ageLabel&&<p className="age">{item.ageLabel}</p>}<nav className="controls"><small className="release-version" aria-label="App version">v{version}</small><button onClick={()=>move(-1)} aria-label="Previous">‹</button><button onClick={()=>setPaused(v=>!v)} aria-label={paused?"Play":"Pause"}>{paused?"▶":"Ⅱ"}</button><button onClick={()=>move(1)} aria-label="Next">›</button><button onClick={()=>setMuted(v=>!v)} aria-label={muted?"Unmute":"Mute"}>{muted?"🔇":"🔊"}</button><button onClick={()=>void document.documentElement.requestFullscreen?.()} aria-label="Fullscreen">⛶</button></nav></main>;
 return <>{content}<audio key="soundtrack" ref={audio} src="/api/soundtrack" loop/></>}

function Family({familyLinkToken}:{familyLinkToken?:string}){const[ready,setReady]=useState<boolean|null>(null);const[ga,setGa]=useState<string>();const[welcomeCopy,setWelcomeCopy]=useState<api.WelcomeCopy>();const[welcomeRequest,setWelcomeRequest]=useState(0);const[welcomeStatus,setWelcomeStatus]=useState<"loading"|"error"|"ready">("loading");const initialRequestStarted=useRef(false);useEffect(()=>{if(initialRequestStarted.current)return;initialRequestStarted.current=true;const authentication=familyLinkToken?api.loginWithFamilyLink(familyLinkToken).then(()=>true):api.status("family").then(v=>v.authenticated);void authentication.then(setReady).catch(()=>setReady(false));void fetch("/api/public-config").then(r=>r.json()).then(v=>{setGa(v.ga4MeasurementId);if(readConsent()==="granted")loadAnalytics(v.ga4MeasurementId);track("page_view")})},[familyLinkToken]);useEffect(()=>{if(!ready)return;let cancelled=false;setWelcomeStatus("loading");void api.getWelcomeCopy().then(copy=>{if(!cancelled){setWelcomeCopy(copy);setWelcomeStatus("ready")}}).catch(()=>{if(!cancelled)setWelcomeStatus("error")});return()=>{cancelled=true}},[ready,welcomeRequest]);if(ready===null)return null;const content=!ready?<Login role="family" onDone={()=>setReady(true)}/>:welcomeStatus==="ready"&&welcomeCopy?<Slideshow welcomeCopy={welcomeCopy}/>:welcomeStatus==="error"?<main className="cover"><section className="login"><p role="alert">We couldn't load the welcome screen. Please try again.</p><button type="button" onClick={()=>setWelcomeRequest(value=>value+1)}>Try again</button></section></main>:<main className="cover"><p role="status">Loading welcome screen…</p></main>;return <>{content}<ConsentPrompt id={ga}/></>}

function Admin(){const[view,setView]=useState<"stats"|"favourites">("stats");const[ok,setOk]=useState<boolean|null>(null);const[period,setPeriod]=useState("all");const[type,setType]=useState("all");const[items,setItems]=useState<Awaited<ReturnType<typeof api.getStats>>["items"]>([]);const load=()=>api.getStats(period,type).then(v=>setItems(v.items));useEffect(()=>{void api.status("admin").then(v=>setOk(v.authenticated))},[]);useEffect(()=>{if(ok&&view==="stats")void load()},[ok,period,type,view]);if(ok===null)return null;if(!ok)return <Login role="admin" onDone={()=>setOk(true)}/>;return <main className="admin"><header><h1>Owner dashboard</h1><button onClick={()=>void api.logout("admin").then(()=>setOk(false))}>Log out</button></header><nav className="admin-tabs" aria-label="Admin sections"><button type="button" aria-pressed={view==="stats"} onClick={()=>setView("stats")}>Most displayed</button><button type="button" aria-pressed={view==="favourites"} onClick={()=>setView("favourites")}>Favourites</button></nav>{view==="favourites"?<AdminFavourites/>:<><div className="filters"><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="7d">7 days</option><option value="30d">30 days</option><option value="all">All time</option></select><select value={type} onChange={e=>setType(e.target.value)}><option value="all">All media</option><option value="IMAGE">Photos</option><option value="VIDEO">Videos</option></select><a href={`/api/admin/stats.csv?period=${period}&type=${type}`}>Export CSV</a></div><section className="grid">{items.map((item,i)=><article key={item.assetId}><span className="rank">#{i+1}</span><img src={item.thumbnailUrl}/><div><strong>{item.periodCount} displays</strong><small>{item.mediaType.toLowerCase()} · {item.totalCount} total</small></div></article>)}</section><button className="danger" onClick={async()=>{if(prompt('Type RESET to clear statistics')==='RESET'){await api.resetStats();await load()}}}>Reset statistics</button></>}</main>}
export function App({familyLinkToken}:{familyLinkToken?:string}){return location.pathname.startsWith("/admin")?<Admin/>:<Family familyLinkToken={familyLinkToken}/>}
