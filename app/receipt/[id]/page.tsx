import {Receipt} from '../../../components/receipt';
export const metadata={title:'Payment receipt',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Receipt id={id}/>;}
