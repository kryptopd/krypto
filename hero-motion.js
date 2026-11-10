(() => {
 const word=document.querySelector("#hero-rotating-word"), image=document.querySelector("#hero-image");
 if(!word||!image)return;
 const words=["atitude.","identidade.","liberdade.","presença.","seu estilo.","seu caminho."];
 let wi=0,ii=0,photos=[];
 const swap=()=>{word.classList.remove("glitch-in");word.classList.add("glitch-out");setTimeout(()=>{wi=(wi+1)%words.length;word.textContent=words[wi];word.classList.remove("glitch-out");word.classList.add("glitch-in");},260);};
 setInterval(swap,2800);
 fetch("/api/products",{cache:"no-store"}).then(r=>r.ok?r.json():[]).then(products=>{
  photos=products.filter(p=>p.active!==false).flatMap(p=>(Array.isArray(p.images)&&p.images.length?p.images:[p.image_url]).filter(Boolean).map(url=>({url,name:p.name})));
  if(!photos.length)return;
  const show=()=>{const item=photos[ii%photos.length];image.classList.add("hero-image-changing");setTimeout(()=>{image.style.backgroundImage=`linear-gradient(180deg,rgba(12,10,15,.02) 35%,rgba(12,10,15,.46)),url("${item.url.replace(/["\\]/g,"")}")`;image.setAttribute("aria-label",`Peça da KRYPTO: ${item.name}`);image.classList.remove("hero-image-changing");ii++;},450);};
  show();setInterval(show,6200);
 }).catch(()=>{});
})();