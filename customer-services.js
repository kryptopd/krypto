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
  reviewForm.addEventListener("submit",async e=>{e.preventDefault();const b=reviewForm.querySelector('[type="submit"]');b.disabled=true;feedback($("#review-feedback"),"Enviando sua avaliação…");const d=Object.fromEntries(new FormData(reviewForm));d.rating=Number(d.rating);try{const r=await fetch("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});const j=await r.json();if(!r.ok)throw Error(j.detail||"Não foi possível enviar.");reviewForm.reset();feedback($("#review-feedback"),"✓ Avaliação recebida! Ela já consta como enviada e ficará visível no site assim que nossa equipe concluir a moderação.");}catch(err){feedback($("#review-feedback"),err.message,true);}finally{b.disabled=false;}});
 }
 const supportForm=$("#support-form");
 if(supportForm){
  const picker=$("#support-photos"),preview=$("#photo-preview");let files=[];
  picker.addEventListener("change",()=>{files=[...picker.files];if(files.length>3){files=[];picker.value="";feedback($("#support-feedback"),"Selecione no máximo 3 fotos.",true);return;}preview.replaceChildren();files.forEach(f=>{const img=document.createElement("img");img.alt="Prévia do anexo";img.src=URL.createObjectURL(f);preview.append(img);});});
  const readFile=f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({type:f.type,data:r.result});r.onerror=reject;r.readAsDataURL(f);});
  supportForm.addEventListener("submit",async e=>{e.preventDefault();const b=supportForm.querySelector('[type="submit"]');b.disabled=true;feedback($("#support-feedback"),"Enviando solicitação e anexos…");try{const d=Object.fromEntries(new FormData(supportForm));d.photos=await Promise.all(files.map(readFile));const r=await fetch("/api/support",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});const j=await r.json();if(!r.ok)throw Error(j.detail||"Não foi possível enviar.");supportForm.reset();files=[];preview.replaceChildren();picker.value="";feedback($("#support-feedback"),`✓ Solicitação recebida! Protocolo ${j.protocol}. Sua mensagem foi encaminhada à equipe KRYPTO para análise.`);}catch(err){feedback($("#support-feedback"),err.message,true);}finally{b.disabled=false;}});
 }
})();