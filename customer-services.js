(() => {
 const $=(s)=>document.querySelector(s);
 const feedback=(el,msg,bad=false)=>{el.textContent=msg;el.dataset.error=bad?"true":"false";};
 const stars=(n)=>"★".repeat(n)+"☆".repeat(5-n);
 const reviewForm=$("#review-form");
 if(reviewForm){
  fetch("/api/reviews").then(r=>r.ok?r.json():[]).then(rows=>{
   const box=$("#approved-reviews");box.replaceChildren();
   if(!rows.length){box.textContent="Ainda não há avaliações publicadas. Seja a primeira pessoa a compartilhar sua experiência.";return;}
   rows.forEach(r=>{const card=document.createElement("article");card.className="review-public";const h=document.createElement("h3");h.textContent=r.product_name;const star=document.createElement("div");star.className="review-stars";star.textContent=stars(r.rating);const p=document.createElement("p");p.textContent=r.comment;const small=document.createElement("small");small.textContent=`${r.customer_name} · ${new Date(r.created_at).toLocaleDateString("pt-BR")}`;card.append(h,star,p,small);box.append(card);});
  }).catch(()=>$("#approved-reviews").textContent="Não foi possível carregar as avaliações agora.");
  const lookup=$("#review-lookup");let verified=null;
  const pre=new URLSearchParams(location.search).get("pedido");if(pre)lookup.elements.order_code.value=pre.toUpperCase();
  const post=async(body)=>{const r=await fetch("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.detail||"Não foi possível concluir.");return j;};
  lookup.addEventListener("submit",async e=>{e.preventDefault();const b=lookup.querySelector('[type="submit"]');b.disabled=true;feedback($("#lookup-feedback"),"Conferindo seu pedido…");
   try{const d=Object.fromEntries(new FormData(lookup));const j=await post({action:"lookup",order_code:d.order_code,email:d.email,website:d.website});
    const open=j.items.filter(i=>!i.reviewed);
    if(!open.length){feedback($("#lookup-feedback"),"Você já avaliou todas as peças deste pedido. Obrigado!");return;}
    verified={order_code:d.order_code,email:d.email};
    const sel=$("#review-product");sel.replaceChildren();open.forEach(i=>{const o=document.createElement("option");o.value=i.product_id;o.textContent=i.name;sel.append(o);});
    $("#review-greeting").textContent=`Olá, ${j.customer}! Conte como foi receber sua compra.`;
    lookup.hidden=true;reviewForm.hidden=false;
   }catch(err){feedback($("#lookup-feedback"),err.message,true);}finally{b.disabled=false;}});
  reviewForm.addEventListener("submit",async e=>{e.preventDefault();const b=reviewForm.querySelector('[type="submit"]');b.disabled=true;feedback($("#review-feedback"),"Enviando sua avaliação…");const d=Object.fromEntries(new FormData(reviewForm));
   try{await post({...verified,product_id:Number(d.product_id),rating:Number(d.rating),comment:d.comment,website:d.website});reviewForm.reset();reviewForm.hidden=true;lookup.hidden=false;lookup.reset();verified=null;feedback($("#lookup-feedback"),"✓ Avaliação recebida! Ela aparece na página da peça assim que nossa equipe concluir a moderação. Quer avaliar outra peça? Informe o pedido de novo.");}
   catch(err){feedback($("#review-feedback"),err.message,true);}finally{b.disabled=false;}});
 }
 const supportForm=$("#support-form");
 if(supportForm){
  const picker=$("#support-photos"),preview=$("#photo-preview");let files=[];
  picker.addEventListener("change",()=>{files=[...picker.files];if(files.length>3){files=[];picker.value="";feedback($("#support-feedback"),"Selecione no máximo 3 fotos.",true);return;}preview.replaceChildren();files.forEach(f=>{const img=document.createElement("img");img.alt="Prévia do anexo";img.src=URL.createObjectURL(f);preview.append(img);});});
  const readFile=f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({type:f.type,data:r.result});r.onerror=reject;r.readAsDataURL(f);});
  supportForm.addEventListener("submit",async e=>{e.preventDefault();const b=supportForm.querySelector('[type="submit"]');b.disabled=true;feedback($("#support-feedback"),"Enviando solicitação e anexos…");try{const d=Object.fromEntries(new FormData(supportForm));d.photos=await Promise.all(files.map(readFile));const r=await fetch("/api/support",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});const j=await r.json();if(!r.ok)throw Error(j.detail||"Não foi possível enviar.");supportForm.reset();files=[];preview.replaceChildren();picker.value="";feedback($("#support-feedback"),`✓ Solicitação recebida! Protocolo ${j.protocol}. Sua mensagem foi encaminhada à equipe KRYPTO para análise.`);}catch(err){feedback($("#support-feedback"),err.message,true);}finally{b.disabled=false;}});
 }
})();