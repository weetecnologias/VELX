import { PublicSite } from '../../components/public-site';
import { notFound } from 'next/navigation';
const sections=['about','programmes','timetable','coaches','gallery','faqs','contact','admission','track','privacy'];
export async function generateMetadata({params}:{params:Promise<{section:string}>}){const {section}=await params;return {title:section.charAt(0).toUpperCase()+section.slice(1)};}
export default async function Page({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!sections.includes(section))notFound();return <PublicSite section={section}/>;}
