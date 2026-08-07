export interface PlaylistItem { id:string; type:"IMAGE"|"VIDEO"; durationMs:number|null; ageLabel:string|null; impressionToken:string; mediaUrl:string; thumbnailUrl:string }
export interface Playlist { playlistId:string; photoDurationMs:number; items:PlaylistItem[] }
async function json<T>(url:string, init?:RequestInit):Promise<T>{ const response=await fetch(url,{credentials:"same-origin",...init,headers:{"content-type":"application/json",...init?.headers}}); if(!response.ok) throw new Error(String(response.status)); return response.json() as Promise<T>; }
export const status=(role:"family"|"admin")=>json<{authenticated:boolean}>(`/api/auth/${role}/status`);
export const login=(role:"family"|"admin",password:string)=>json(`/api/auth/${role}`,{method:"POST",body:JSON.stringify({password})});
export const logout=(role:"family"|"admin")=>json(`/api/auth/${role}/logout`,{method:"POST",body:""});
export const createPlaylist=()=>json<Playlist>("/api/playlist",{method:"POST",body:""});
export const countDisplay=(impressionToken:string)=>json("/api/stats/display",{method:"POST",body:JSON.stringify({impressionToken})});
export const getStats=(period:string,type:string)=>json<{items:Array<{assetId:string;mediaType:string;periodCount:number;totalCount:number;lastDisplayedAt:string;thumbnailUrl:string}>}>(`/api/admin/stats?period=${period}&type=${type}`);
export const resetStats=()=>json("/api/admin/stats",{method:"DELETE",body:JSON.stringify({confirmation:"RESET"})});

