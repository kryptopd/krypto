const { getSupabase, sendError, requireMethod, requireAdmin } = require("../_lib/supabase");
module.exports = async function handler(req,res) {
 if (!requireMethod(req,res,["GET","PATCH","DELETE"])) return;
 if (!(await requireAdmin(req,res))) return;
 try {
  const db=getSupabase(), id=Number(req.query.id);
  if(req.method==="GET"){
   const {data,error}=await db.from("reviews").select("*").order("created_at",{ascending:false}).limit(200);
   if(error) throw error; return res.status(200).json(data||[]);
  }
  if(!Number.isInteger(id)||id<1) return res.status(400).json({detail:"ID inválido."});
  if(req.method==="DELETE"){const {error}=await db.from("reviews").delete().eq("id",id); if(error)throw error; return res.status(204).end();}
  const status=String((req.body||{}).status||"");
  if(!["approved","rejected","pending"].includes(status)) return res.status(400).json({detail:"Status inválido."});
  const {data,error}=await db.from("reviews").update({status,moderated_at:new Date().toISOString()}).eq("id",id).select().single();
  if(error)throw error; return res.status(200).json(data);
 } catch(e){return sendError(res,e);}
};
