import {useEffect,useRef,useState} from "react";
import {getFavourites,removeFavourite,type Favourite} from "./api.js";

function FavouritePreview({item,onClose}:{item:Favourite;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [unavailable,setUnavailable]=useState(false);
 useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close()},[]);
 return <dialog className="favourite-preview" ref={dialog} aria-label="Favourite preview" onCancel={onClose}>
  <header><h2>{item.mediaType==="VIDEO"?"Favourite video":"Favourite photo"}</h2><button type="button" onClick={onClose} aria-label="Close preview">Close</button></header>
  {unavailable?<p role="alert">This moment is unavailable. It may have been removed from the photo library.</p>:item.mediaType==="VIDEO"?<video src={item.mediaUrl} poster={item.thumbnailUrl} controls playsInline onError={()=>setUnavailable(true)}/>:<img src={item.mediaUrl} alt="Saved favourite" onError={()=>setUnavailable(true)}/>}
 </dialog>;
}

export function AdminFavourites(){
 const [items,setItems]=useState<Favourite[]>([]);
 const [state,setState]=useState<"loading"|"ready"|"error">("loading");
 const [reload,setReload]=useState(0);
 const [selected,setSelected]=useState<Favourite|null>(null);
 const [removing,setRemoving]=useState<string|null>(null);
 const [removeError,setRemoveError]=useState(false);
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{
  let active=true;setState("loading");setRemoveError(false);
  void getFavourites().then(result=>{if(active){setItems(result.items);setState("ready")}}).catch(()=>{if(active)setState("error")});
  return()=>{active=false};
 },[reload]);
 const remove=async(item:Favourite)=>{
  if(removing)return;
  setRemoving(item.assetId);setRemoveError(false);
  try{await removeFavourite(item.assetId);if(mounted.current){setItems(values=>values.filter(value=>value.assetId!==item.assetId));if(selected?.assetId===item.assetId)setSelected(null)}}
  catch{if(mounted.current)setRemoveError(true)}
  finally{if(mounted.current)setRemoving(null)}
 };
 return <section aria-label="Shared favourites" className="admin-favourites">
  <div className="favourites-heading"><div><h2>Favourite moments</h2><p>Saved by your family. Remove saves here without deleting the original photos or videos.</p></div><button type="button" disabled={state==="loading"||removing!==null} onClick={()=>setReload(value=>value+1)}>Refresh</button></div>
  {state==="loading"?<p role="status">Loading favourites…</p>:state==="error"?<div role="alert"><p>Couldn’t load favourites.</p><button type="button" onClick={()=>setReload(value=>value+1)}>Try again</button></div>:<>
   {removeError&&<p role="alert">Couldn’t remove this favourite. Please try again.</p>}
   {items.length===0?<div className="favourites-empty"><span aria-hidden="true">♡</span><h3>No favourites yet</h3><p>Double-tap any moment in the slideshow to save it here.</p></div>:<><p className="favourites-count">{items.length} saved {items.length===1?"moment":"moments"}</p><div className="grid favourites-grid">{items.map(item=><article key={item.assetId}>
    <button className="favourite-thumbnail" type="button" onClick={()=>setSelected(item)} aria-label={item.mediaType==="VIDEO"?"View video":"View photo"}><img src={item.thumbnailUrl} alt="" loading="lazy"/>{item.mediaType==="VIDEO"&&<span className="video-badge" aria-hidden="true">▶</span>}</button>
    <div><strong>{item.mediaType==="VIDEO"?"Video":"Photo"}</strong><small>Saved {new Date(item.savedAt).toLocaleDateString()}</small><button type="button" className="remove-favourite" disabled={removing!==null} onClick={()=>void remove(item)}>{removing===item.assetId?"Removing…":"Remove favourite"}</button></div>
   </article>)}</div></>}
  </>}
  {selected&&<FavouritePreview item={selected} onClose={()=>setSelected(null)}/>}
 </section>;
}
