const { getSupabase, sendError, requireMethod, requireAdmin } = require("../../_lib/supabase");
module.exports=async function(req,res){
 if(!requireMethod(req,res,["PATCH","DELETE"]))return;
 if(!(await requireAdmin(req,res)))return;
 try{
  const id=Number(req.query.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({detail:"ID inválido."});
  const db=getSupabase(),{data:current,error:readError}=await db.from("support_requests").select("*").eq("id",id).single();
  if(readError)throw readError;
  if(req.method==="PATCH"){
   const status=String((req.body||{}).status||"");
   if(!["open","in_review","resolved","rejected"].includes(status))return res.status(400).json({detail:"Status inválido."});
   const {data,error}=await db.from("support_requests").update({status,resolved_at:status==="resolved"?new Date().toISOString():null}).eq("id",id).select().single();
   if(error)throw error;return res.status(200).json(data);
  }
  if(current.status!=="resolved")return res.status(409).json({detail:"Só solicitações marcadas como resolvidas podem ser excluídas."});
  if(current.photo_paths?.length)await db.storage.from("support-attachments").remove(current.photo_paths);
  const {error}=await db.from("support_requests").delete().eq("id",id);if(error)throw error;
  return res.status(204).end();
 }catch(e){return sendError(res,e);}
};
