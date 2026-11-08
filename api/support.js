const { getSupabase, sendError, requireMethod } = require("./_lib/supabase");
const recent = new Map();
const allowedReasons = ["Troca","Devolução","Reembolso","Produto com defeito","Produto incorreto","Outro"];
module.exports = async function handler(req,res){
 if(!requireMethod(req,res,["POST"]))return;
 try{
  const b=req.body||{};
  if(String(b.website||"").trim())return res.status(400).json({detail:"Envio inválido."});
  const name=String(b.name||"").trim(), email=String(b.email||"").trim().toLowerCase(), phone=String(b.phone||"").trim();
  const order=String(b.order_code||"").trim(), reason=String(b.reason||"");
  const comment=String(b.comment||"").trim(), date=String(b.purchase_date||"").trim();
  if(!name||name.length>140||!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)||email.length>254||phone.replace(/\D/g,"").length<10||!order||order.length>40||!allowedReasons.includes(reason)||!date||!comment||comment.length>2000)
   return res.status(400).json({detail:"Preencha corretamente os dados da compra e da solicitação."});
  const files=Array.isArray(b.photos)?b.photos:[];
  if(files.length>3)return res.status(400).json({detail:"Você pode anexar no máximo 3 fotos."});
  const ip=String(req.headers["x-forwarded-for"]||"unknown").split(",")[0], now=Date.now();
  if(now-(recent.get(ip)||0)<45000)return res.status(429).json({detail:"Aguarde antes de abrir outra solicitação."});
  const db=getSupabase();
  // Confirma que o código, e-mail e telefone pertencem ao mesmo pedido antes de abrir o caso.
  const {data:foundOrder,error:orderError}=await db.from("orders").select("public_id,email,phone,created_at").eq("public_id",order.toUpperCase()).maybeSingle();
  if(orderError)throw orderError;
  const digits=v=>String(v||"").replace(/\D/g,"");
  if(!foundOrder||!foundOrder.public_id||String(foundOrder.email).toLowerCase()!==email||digits(foundOrder.phone).slice(-11)!==digits(phone).slice(-11))
   return res.status(400).json({detail:"Não encontramos um pedido com essa combinação de código, e-mail e telefone. Confira os dados usados na compra."});
  const parsedDate=new Date(`${date}T12:00:00`);
  if(Number.isNaN(parsedDate.getTime())||parsedDate>new Date())return res.status(400).json({detail:"Informe uma data de compra válida, que não seja futura."});
  const validatedFiles=files.map(f=>{
   if(!f||!/^image\/(jpeg|png|webp)$/.test(f.type||"")||!new RegExp(`^data:${f.type.replace("/","\\/")};base64,`).test(f.data||"")) {
    const error=new Error("Envie somente imagens JPG, PNG ou WEBP.");error.statusCode=400;throw error;
   }
   const raw=Buffer.from(f.data.split(",")[1],"base64");
   if(raw.length>900*1024){const error=new Error("Cada foto deve ter no máximo 900 KB.");error.statusCode=413;throw error;}
   return {type:f.type,raw,ext:({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[f.type]};
  });
  const paths=[];
  try {
   for(const f of validatedFiles){
    const path=`${Date.now()}-${require("crypto").randomBytes(8).toString("hex")}.${f.ext}`;
    const {error}=await db.storage.from("support-attachments").upload(path,f.raw,{contentType:f.type,upsert:false});
    if(error)throw error; paths.push(path);
   }
  } catch(uploadError) { if(paths.length)await db.storage.from("support-attachments").remove(paths); throw uploadError; }
  const {data,error}=await db.from("support_requests").insert({
   customer_name:name,email,phone,order_code:order,purchase_date:date,reason,comment,photo_paths:paths,status:"open"
  }).select("id,public_code").single();
  if(error){if(paths.length)await db.storage.from("support-attachments").remove(paths);throw error;}
  recent.set(ip,now);
  return res.status(201).json({message:"Solicitação recebida. Nossa equipe fará a análise.",protocol:data.public_code});
 }catch(e){return sendError(res,e);}
};
