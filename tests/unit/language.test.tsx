// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://slideshow.example.com/"}
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,afterEach,expect,test,vi} from "vitest";
import {LanguageProvider,LanguageSwitcher,useLanguage,detectLanguage} from "../../src/client/language.js";
function Example(){const {t}=useLanguage();return <><LanguageSwitcher/><p>{t("Saved to favourites")}</p></>}
beforeEach(()=>{const values=new Map<string,string>();Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem:vi.fn((key:string)=>values.get(key)??null),setItem:vi.fn((key:string,value:string)=>values.set(key,value)),clear:()=>values.clear()}})});
afterEach(()=>{cleanup();vi.restoreAllMocks()});
test.each([['zh-CN','zh-Hans'],['zh-SG','zh-Hans'],['zh-TW','zh-Hant'],['zh-HK','zh-Hant'],['zh-MO','zh-Hant'],['zh-Hant-CN','zh-Hant'],['zh-Hans-TW','zh-Hans'],['zh','zh-Hans'],['en-AU','en'],['fr','en']])("maps %s to %s",(input,expected)=>expect(detectLanguage([input])).toBe(expected));
test("uses the first supported browser language",()=>expect(detectLanguage(['fr-FR','zh-TW','en'])).toBe('zh-Hant'));
test("remembers a manual override and updates document language",()=>{
 vi.spyOn(navigator,'languages','get').mockReturnValue(['zh-TW']);
 const first=render(<LanguageProvider><Example/></LanguageProvider>);
 expect(screen.getByText('已加入收藏')).toBeTruthy();expect(document.documentElement.lang).toBe('zh-Hant');
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'zh-Hans'}});
 expect(screen.getByText('已加入收藏')).toBeTruthy();expect(document.documentElement.lang).toBe('zh-Hans');
 first.unmount();render(<LanguageProvider><Example/></LanguageProvider>);
 expect(document.documentElement.lang).toBe('zh-Hans');
});
test("still switches language when browser storage is unavailable",()=>{
 vi.spyOn(window.localStorage,'getItem').mockImplementation(()=>{throw new Error('blocked')});
 vi.spyOn(window.localStorage,'setItem').mockImplementation(()=>{throw new Error('blocked')});
 render(<LanguageProvider><Example/></LanguageProvider>);
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'zh-Hant'}});
 expect(document.documentElement.lang).toBe('zh-Hant');
});
