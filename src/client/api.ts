export interface PlaylistItem { id:string; type:"IMAGE"|"VIDEO"; durationMs:number|null; ageLabel:string|null; impressionToken:string; mediaUrl:string; thumbnailUrl:string; motionUrl?:string; isFavourite?:boolean }
export interface Playlist { playlistId:string; photoDurationMs:number; items:PlaylistItem[] }
export interface WelcomeCopy { eyebrow:string; title:string; body:string }
async function json<T>(url:string, init?:RequestInit):Promise<T>{
  const headers=new Headers(init?.headers);
  if(init?.body!==undefined&&init.body!==null&&init.body!==""&&!headers.has("content-type"))headers.set("content-type","application/json");
  const response=await fetch(url,{credentials:"same-origin",...init,headers});
  if(!response.ok)throw new Error(String(response.status));
  return response.json() as Promise<T>;
}
export const status=(role:"family"|"admin")=>json<{authenticated:boolean}>(`/api/auth/${role}/status`);
export const login=(role:"family"|"admin",password:string)=>json(`/api/auth/${role}`,{method:"POST",body:JSON.stringify({password})});
export const loginWithFamilyLink=(token:string)=>json("/api/auth/family-link",{method:"POST",body:JSON.stringify({token})});
export const logout=(role:"family"|"admin")=>json(`/api/auth/${role}/logout`,{method:"POST",body:""});
export const createPlaylist=()=>json<Playlist>("/api/playlist",{method:"POST",body:""});
export const getWelcomeCopy=()=>json<WelcomeCopy>("/api/welcome");
export const countDisplay=(impressionToken:string)=>json("/api/stats/display",{method:"POST",body:JSON.stringify({impressionToken})});
export const getStats=(period:string,type:string)=>json<{items:Array<{assetId:string;mediaType:string;periodCount:number;totalCount:number;lastDisplayedAt:string;thumbnailUrl:string}>}>(`/api/admin/stats?period=${period}&type=${type}`);
export const resetStats=()=>json("/api/admin/stats",{method:"DELETE",body:JSON.stringify({confirmation:"RESET"})});
export interface Favourite {assetId:string;mediaType:"IMAGE"|"VIDEO";savedAt:string;thumbnailUrl:string;mediaUrl:string}
export const saveFavourite=(assetId:string)=>json<{saved:true;created:boolean}>("/api/favourites",{method:"POST",body:JSON.stringify({assetId})});
export const getFavourites=()=>json<{items:Favourite[]}>("/api/admin/favourites");
export const removeFavourite=(assetId:string)=>json<{success:true}>(`/api/admin/favourites/${encodeURIComponent(assetId)}`,{method:"DELETE"});
