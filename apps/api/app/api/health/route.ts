import { db } from '../../../src/core/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 try{await db.$queryRaw`SELECT 1`;return Response.json({status:'ok',service:'ceo-api',database:'connected'},{headers:{'cache-control':'no-store'}});}
 catch{return Response.json({status:'unavailable',service:'ceo-api'},{status:503,headers:{'cache-control':'no-store'}});}
}
