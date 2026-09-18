import {useEffect,useRef,useState} from "react";
import {saveFavourite} from "./api.js";

type SaveStatus="idle"|"saving"|"saved"|"already"|"error";
export function useSaveFavourite(assetId:string|undefined,initiallyLiked=false){
 const [likedIds,setLikedIds]=useState<Set<string>>(()=>new Set());
 const [feedbackId,setFeedbackId]=useState(0);
 const [result,setResult]=useState<{assetId:string;status:SaveStatus}|null>(null);
 const request=useRef<object|null>(null);
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{setResult(null);return()=>{request.current=null}},[assetId]);
 const status=result&&result.assetId===assetId?result.status:"idle";
 const save=async()=>{
  if(!assetId||request.current)return;
  const current={};request.current=current;
  setFeedbackId(value=>value+1);
  setResult({assetId,status:"saving"});
  try{
   const response=await saveFavourite(assetId);
   if(mounted.current)setLikedIds(previous=>new Set(previous).add(assetId));
   if(request.current===current)setResult({assetId,status:response.created?"saved":"already"});
  }catch{
   if(request.current===current)setResult({assetId,status:"error"});
  }finally{if(request.current===current)request.current=null}
 };
 return {status,save,feedbackId,liked:initiallyLiked||Boolean(assetId&&likedIds.has(assetId))};
}

export function FavouriteButton({status,save,liked,feedbackId}:{status:SaveStatus;save:()=>Promise<void>;liked:boolean;feedbackId:number}){
 const [showFeedback,setShowFeedback]=useState(false);
 useEffect(()=>{
  setShowFeedback(status!=="idle");
  if(status!=="saved"&&status!=="already")return;
  const timer=setTimeout(()=>setShowFeedback(false),2400);
  return()=>clearTimeout(timer);
 },[status,feedbackId]);
 const saved=status==="saved"||status==="already";
 const message=status==="saving"?"Saving…":status==="saved"?"Saved to favourites":status==="already"?"Already in favourites":status==="error"?"Couldn’t save. Tap the heart to retry.":"";
 return <>
  <div className={`favourite-tools ${liked?"is-liked":""}`}>
   <button type="button" className={liked?"favourite-save is-saved":"favourite-save"} aria-pressed={liked} aria-label={status==="saving"?"Saving favourite":liked?"Save favourite again":"Save favourite"} title="Double-tap to like this moment for everyone" disabled={status==="saving"} onClick={()=>void save()}>{liked?"♥":"♡"}</button>
   <span className="favourite-hint">{liked?"Liked":"Double-tap to like"}</span>
  </div>
  {showFeedback&&<div key={`${feedbackId}-${status}`} className={`favourite-feedback ${saved?"is-saved":""}`} role={status==="error"?"alert":"status"}>
   {status!=="error"&&<div className={`heart-burst ${saved?"is-confirmed":"is-saving"}`} aria-hidden="true">
    <svg className="heart-burst-icon" viewBox="0 0 24 24"><path d="M12 21s-9-5.6-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.4-9 12-9 12Z"/></svg>
    {saved&&<><i/><i/><i/><i/><i/><i/></>}
   </div>}
   <span className="favourite-feedback-message">{message}</span>
  </div>}
 </>;
}
