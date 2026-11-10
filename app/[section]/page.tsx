import { PublicSite } from '../../components/public-site';
import { notFound, redirect } from 'next/navigation';
const marketingSections=['about','programmes','timetable','coaches','gallery','faqs','contact'];
const sections=[...marketingSections,'admission','track','privacy'];
export async function generateMetadata({params}:{params:Promise<{section:string}>}){const {section}=await params;return {title:section.charAt(0).toUpperCase()+section.slice(1)};}
export default async function Page({params,searchParams}:{
 params:Promise<{section:string}>;
 searchParams:Promise<Record<string,string|string[]|undefined>>;
}){
 const {section}=await params;
 if(!sections.includes(section))notFound();
 if(marketingSections.includes(section)){
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams)){
   for(const item of Array.isArray(value)?value:[value]){
    if(item!==undefined)query.append(key,item);
   }
  }
  redirect('/'+(query.size?'?'+query.toString():'')+'#'+section);
 }
 return <PublicSite section={section}/>;
}
