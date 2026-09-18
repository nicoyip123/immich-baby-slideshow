import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {translations,type Message} from "./translations.js";
export type Language="en"|"zh-Hans"|"zh-Hant";
const storageKey="baby-slideshow-language";
const isLanguage=(value:unknown):value is Language=>value==="en"||value==="zh-Hans"||value==="zh-Hant";
export function detectLanguage(languages:readonly string[]):Language{
 for(const language of languages){
  const tag=language.toLowerCase().replaceAll("_","-");
  if(tag==="en"||tag.startsWith("en-"))return "en";
  if(tag==="zh"||tag.startsWith("zh-")){
   const parts=tag.split("-");
   if(parts.includes("hant"))return "zh-Hant";
   if(parts.includes("hans"))return "zh-Hans";
   return parts.some(part=>["tw","hk","mo"].includes(part))?"zh-Hant":"zh-Hans";
  }
 }
 return "en";
}
function initialLanguage():Language{
 try{const saved=window.localStorage.getItem(storageKey);if(isLanguage(saved))return saved}catch{}
 return detectLanguage(navigator.languages?.length?navigator.languages:[navigator.language]);
}
export function translate(language:Language,message:Message,values:Record<string,string|number>={}):string{
 const text=language==="en"?message:translations[message][language==="zh-Hans"?0:1];
 return text.replace(/\{(\w+)\}/g,(placeholder,key)=>values[key]===undefined?placeholder:String(values[key]));
}
const LanguageContext=createContext({language:"en" as Language,setLanguage:(_language:Language)=>{}});
export function LanguageProvider({children}:{children:ReactNode}){
 const [language,setCurrent]=useState<Language>(initialLanguage);
 const setLanguage=(next:Language)=>{if(!isLanguage(next))return;setCurrent(next);try{window.localStorage.setItem(storageKey,next)}catch{}};
 useEffect(()=>{document.documentElement.lang=language;document.title=translate(language,"Immich Baby Slideshow")},[language]);
 return <LanguageContext.Provider value={{language,setLanguage}}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){
 const context=useContext(LanguageContext);
 return {...context,t:(message:Message,values?:Record<string,string|number>)=>translate(context.language,message,values),date:(value:string)=>new Intl.DateTimeFormat(context.language==="en"?"en-AU":context.language==="zh-Hans"?"zh-CN":"zh-TW").format(new Date(value))};
}
export function LanguageSwitcher(){
 const {language,setLanguage,t}=useLanguage();
 return <label className="language-switcher"><span aria-hidden="true">文 / A</span><select aria-label={t("Language")} value={language} onChange={event=>setLanguage(event.target.value as Language)}><option value="en" lang="en">English</option><option value="zh-Hans" lang="zh-Hans">简体中文</option><option value="zh-Hant" lang="zh-Hant">繁體中文</option></select></label>;
}
