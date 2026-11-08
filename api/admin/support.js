const { getSupabase, sendError, requireMethod, requireAdmin } = require("../_lib/supabase");
module.exports=async function(req,res){
 if(!requireMethod(req,res,["GET"]))return;
 if(!(await requireAdmin(req,res)))return;
 try{
  const db=getSupabase(),{data,error}=await db.from("support_requests").select("*").order("created_at",{ascending:false}).limit(200);
  if(error)throw error;
  const rows=await Promise.all((data||[]).map(async r=>{
   const urls=[];
   for(const path of (r.photo_paths||[])){const {data:signed}=await db.storage.from("support-attachments").createSignedUrl(path,900);if(signed?.signedUrl)urls.push(signed.signedUrl);}
   return {...r,photo_urls:urls};
  }));
  return res.status(200).json(rows);
 }catch(e){return sendError(res,e);}
};
