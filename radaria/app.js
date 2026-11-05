/* RadarIA consumer-first storefront: observed prices, no fictional discounts. */
(() => {
  'use strict';
  const LIVE_API = 'https://btqbgzkhnfjskpvhjhgy.supabase.co/functions/v1/radaria-catalog';
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const BASE = LOCAL ? '/api' : LIVE_API;
  const state = {page:1,limit:24,q:'',category:'',sort:'recent',categories:[],count:0,nonce:0,loading:false};
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const num = (n) => Number(n||0).toLocaleString('pt-BR');
  const esc = (s) => String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const maybeDate = (s) => { if(!s)return null; const d = new Date(s); return Number.isFinite(+d) ? d : null; };
  const seen = (s) => { const d=maybeDate(s); return d ? d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'sem horário'; };
  const age = (s) => { const d=maybeDate(s); if(!d) return 'Horário indisponível'; const h=Math.max(0,(Date.now()-Number(d))/3600000); return h<1?'há menos de 1h':h<24?'há '+Math.floor(h)+'h':'há '+Math.floor(h/24)+' dia(s)'; };
  const validLink = (s) => { try{const u=new URL(s);return u.protocol==='https:'&&/(^|\.)mercadolivre\.com\.br$/i.test(u.hostname)?u.toString():'';}catch{return '';} };
  const validImage = (s) => {try{const u=new URL(s);return u.protocol==='https:' && /(^|\.)(mlstatic\.com|mercadolivre\.com\.br)$/i.test(u.hostname)?u.toString():'';}catch{return '';} };
  let toastTimer;
  function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.hidden=true,3400);}
  function delay(fn,ms){let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}
  function query(params){ return Object.keys(params).filter(k=>params[k]!==''&&params[k]!=null).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(params[k])).join('&'); }
  async function json(url){const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'}); if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
  function normalized(p){
    if(!LOCAL)return p;
    const o=p.best_offer;
    return {id:p.id,name:p.name,category:p.category,brand:p.brand,model:p.model,image_url:p.image_url,
      offer:o?{id:o.id,price:o.price,shipping:o.shipping,total:o.total,url:o.url,store:o.merchant,observed_at:o.observed_at,is_stale:!!o.stale,verified:!!o.verified}:null};
  }
  async function fetchList(){
    if(LOCAL){
      const path='/api/catalog?'+query({q:state.q,category:state.category,sort:state.sort==='price'?'price_asc':'smart',limit:100});
      const data=await json(path);
      const products=(data.products||[]).map(normalized).filter(x=>x.offer&&!x.best_offer?.is_demo);
      if(state.sort==='name')products.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      if(state.sort==='recent')products.sort((a,b)=>Date.parse(b.offer.observed_at)-Date.parse(a.offer.observed_at));
      return {products:products.slice((state.page-1)*state.limit,state.page*state.limit),count:products.length,total_monitored:products.length,
        categories:[...new Set(products.map(p=>p.category))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')),last_observed_at:products[0]?.offer?.observed_at};
    }
    return json(BASE+'?'+query({q:state.q,category:state.category,sort:state.sort,page:state.page,limit:state.limit}));
  }
  async function fetchDetail(id){
    if(!LOCAL)return json(BASE+'?'+query({id}));
    const p=await json('/api/products/'+encodeURIComponent(id));
    const o=p.offers?.[0]||p.best_offer;
    const hist=(p.history||[]).map(x=>({observed_at:x.date+'T12:00:00Z',price:x.min_price}));
    return {product:{id:p.id,name:p.name,category:p.category,brand:p.brand,model:p.model,image_url:p.image_url,
      offer:o?{price:o.price,shipping:o.shipping,total:o.total,url:o.url,store:o.merchant,observed_at:o.observed_at,is_stale:o.stale}:null,
      analysis:{history:hist,readings:hist.length,history_days:p.best_offer?.history_days||0,
        sufficient_history:!!p.best_offer?.sufficient_history,baseline:p.best_offer?.baseline??null,discount_pct:p.best_offer?.discount_pct??null}}};
  }
  function imageBlock(p){
    const img=validImage(p.image_url);
    if(img)return '<img loading="lazy" src="'+esc(img)+'" alt="Foto de '+esc(p.name)+'">';
    const symbol=String(p.name||'?').trim().slice(0,1).toUpperCase();
    return '<div class="visual-placeholder" aria-label="Foto não disponível"><span class="placeholder-symbol">'+esc(symbol)+'</span><small>Foto não disponível</small></div>';
  }
  function safeOffer(p){return p.offer&&Number.isFinite(Number(p.offer.total))&&Number(p.offer.total)>0?p.offer:null;}
  function productCard(p){
    const o=safeOffer(p);if(!o)return '';
    const stale=o.is_stale||!maybeDate(o.observed_at)||Date.now()-Date.parse(o.observed_at)>4*3600000;
    const url=validLink(o.url);
    const label=stale?'Conferir preço atualizado':'Histórico em formação';
    const link=url?'<a class="merchant-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer nofollow sponsored" aria-label="Conferir '+esc(p.name)+' no Mercado Livre">Ver na loja <span aria-hidden="true">↗</span></a>':'<span class="merchant-link disabled">Indisponível</span>';
    return '<article class="product-card">'+
      '<div class="product-visual"><span class="visual-tag">Preço observado</span>'+imageBlock(p)+'</div>'+
      '<div class="product-body"><span class="product-category">'+esc(p.category||'Produto')+'</span><h3 class="product-name">'+esc(p.name)+'</h3>'+
      '<div class="product-price">'+fmt(o.total)+'</div><div class="source-line"><b>'+esc(o.store||'Mercado Livre')+'</b><span>·</span><span>'+esc(age(o.observed_at))+'</span></div>'+
      '<div class="history-tag '+(stale?'stale':'')+'">'+label+'</div>'+
      '<div class="product-buttons"><button class="details-btn" data-details="'+esc(p.id)+'" type="button">Entender o preço</button>'+link+'</div></div></article>';
  }
  function categories(){
    const labels=['Todos',...state.categories];
    $('#categories').innerHTML=labels.map(c=>{
      const val=c==='Todos'?'':c, active=state.category===val;
      return '<button type="button" class="category '+(active?'active':'')+'" data-category="'+esc(val)+'" aria-pressed="'+active+'">'+esc(c)+'</button>';
    }).join('');
  }
  function render(data,append){
    state.count=Number(data.count)||0;
    if(Array.isArray(data.categories)&&data.categories.length){state.categories=data.categories.filter(x=>typeof x==='string');categories();}
    $('#resultCount').textContent=num(state.count)+(state.count===1?' produto encontrado':' produtos encontrados');
    const html=(data.products||[]).filter(p=>safeOffer(p)).map(productCard).join('');
    if(append){$('#productGrid').insertAdjacentHTML('beforeend',html);}else{
      $('#productGrid').innerHTML=html||'<div class="empty-state"><strong>Nenhum produto por aqui ainda.</strong><p>Tente outra busca ou remova os filtros. Nosso catálogo cresce à medida que novas fontes são verificadas.</p><button type="button" id="resetFilters">Limpar filtros</button></div>';
    }
    const more=state.page*state.limit<state.count;$('#loadMore').hidden=!more;
    if(data.last_observed_at){$('#updatedText').textContent='Última leitura: '+seen(data.last_observed_at)+' (SP)';}
    else $('#updatedText').textContent='Aguardando próxima leitura';
    $('#sourceNote').textContent=num(data.total_monitored??state.count)+' produtos reais monitorados · preços verificados na fonte';
  }
  async function load(append=false){
    const nonce=++state.nonce;state.loading=true;$('#loadMore').disabled=true;
    if(!append)$('#productGrid').innerHTML='<div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div>';
    try{const data=await fetchList();if(nonce!==state.nonce)return;render(data,append);}
    catch(e){if(nonce!==state.nonce)return;
      if(!append)$('#productGrid').innerHTML='<div class="empty-state"><strong>O catálogo não carregou.</strong><p>Não vamos mostrar preços antigos como se fossem atuais. Tente novamente em alguns instantes.</p><button type="button" id="retryLoad">Tentar novamente</button></div>';
      $('#resultCount').textContent='Não foi possível obter preços agora';$('#sourceNote').textContent='Dados temporariamente indisponíveis';$('#loadMore').hidden=true;
    }
    finally{if(nonce===state.nonce){state.loading=false;$('#loadMore').disabled=false;}}
  }
  function applyFilters(){state.page=1;load(false);}
  function priceMessage(a,o){
    if(!a||!a.sufficient_history)return {title:'Histórico em formação',body:'Ainda não temos leituras de pelo menos 7 dias diferentes distribuídos por 14 dias. Por isso não classificamos este preço como promoção.'};
    const pct=Number(a.discount_pct);
    if(!Number.isFinite(pct))return {title:'Histórico em análise',body:'Os registros disponíveis não permitem uma comparação confiável agora.'};
    if(pct>=5)return {title:'Abaixo da mediana observada',body:'O preço atual está '+Math.abs(pct).toLocaleString('pt-BR')+'% abaixo da mediana medida na janela. Isso não garante que seja o menor preço do mercado.'};
    if(pct<=-5)return {title:'Acima da mediana observada',body:'O preço atual está acima do padrão medido nos últimos registros. Pode valer a pena acompanhar antes de comprar.'};
    return {title:'Perto da faixa habitual',body:'O preço atual está próximo da mediana observada. A decisão depende mais da sua necessidade do que de uma queda excepcional.'};
  }
  function chart(points){
    if(points.length===0)return '<div class="chart-empty">Nenhuma leitura anterior disponível. O histórico começa quando a coleta registra preços reais.</div>';
    if(points.length===1)return '<div class="chart-empty"><strong>Primeiro registro: '+fmt(points[0].price)+'</strong><br>Um ponto de preço não forma uma tendência. Vamos mostrar a evolução quando houver novas medições.</div>';
    const rows=points.slice(-60).filter(x=>Number.isFinite(Number(x.price))&&maybeDate(x.observed_at));
    if(rows.length<2)return '<div class="chart-empty">Registros insuficientes para traçar o gráfico.</div>';
    const vals=rows.map(x=>Number(x.price)),min=Math.min(...vals),max=Math.max(...vals),d=Math.max(1,max-min);
    const times=rows.map(x=>Date.parse(x.observed_at)),tmin=Math.min(...times),tmax=Math.max(...times),span=Math.max(1,tmax-tmin);
    const pts=rows.map((x,i)=>{const X=25+(times[i]-tmin)/span*490,Y=121-(vals[i]-min)/d*94;return {x:X,y:Y};});
    const path=pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
    const dots=pts.map(p=>'<circle cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="3"/>').join('');
    return '<svg class="mini-chart" viewBox="0 0 540 150" role="img" aria-label="Gráfico com '+rows.length+' observações reais de preço. Menor valor '+fmt(min)+', maior valor '+fmt(max)+'"><line x1="25" y1="121" x2="515" y2="121"/><line x1="25" y1="27" x2="515" y2="27"/><path d="'+path+'"/>'+dots+'</svg><div class="chart-foot"><span>Menor observado: '+fmt(min)+'</span><span>Maior observado: '+fmt(max)+'</span></div>';
  }
  async function openDetails(id){
    const dialog=$('#productDialog');
    $('#dialogContent').innerHTML='<p class="fineprint">Carregando informações observadas…</p>';
    if(!dialog.open)dialog.showModal();
    try{
      const response=await fetchDetail(id);if(!dialog.open)return;
      const p=response.product,o=p.offer;if(!o)throw Error('offer_missing');
      const a=p.analysis||{},message=priceMessage(a,o),url=validLink(o.url);
      const img=validImage(p.image_url);
      const art=img?'<img alt="'+esc(p.name)+'" src="'+esc(img)+'">':'<span class="placeholder-symbol" aria-label="Imagem não disponível">'+esc(p.name?.slice(0,1)||'?')+'</span>';
      const stale=o.is_stale||!maybeDate(o.observed_at)||Date.now()-Date.parse(o.observed_at)>4*3600000;
      const link=url?'<a href="'+esc(url)+'" rel="noopener noreferrer nofollow sponsored" target="_blank">Conferir preço na loja ↗</a>':'';
      $('#dialogContent').innerHTML='<div class="dialog-content">'+
        '<span class="dialog-eyebrow">'+esc(p.category||'Produto')+' · PREÇO OBSERVADO</span><h2 id="dialogTitle">'+esc(p.name)+'</h2>'+
        '<div class="dialog-main"><div class="dialog-art">'+art+'</div><div><div class="dialog-price">'+fmt(o.total)+'</div>'+
        '<div class="dialog-facts"><div>Loja: <strong>'+esc(o.store||'Mercado Livre')+'</strong></div><div>Frete informado: <strong>'+fmt(o.shipping)+'</strong></div><div>Leitura: <strong>'+esc(seen(o.observed_at))+' (SP)</strong></div>'+
        (stale?'<div>⚠️ Confirme o preço atualizado antes de comprar.</div>':'')+'</div><div class="dialog-actions">'+link+'<button type="button" id="copyProduct">Compartilhar produto</button></div></div></div>'+
        '<div class="analysis-panel"><strong>'+esc(message.title)+'</strong><p>'+esc(message.body)+'</p></div>'+
        '<div class="chart-panel"><h3>Histórico observado</h3>'+chart(a.history||[])+'<p class="fineprint">'+num(a.readings||0)+' registros · '+num(a.history_days||0)+' dias distintos. Sem interpolação de preços não medidos.</p></div>'+
        '<p class="fineprint">O RadarIA não realiza a venda. Os preços podem mudar, e o comerciante confirma condições e disponibilidade no checkout. Links comerciais podem gerar comissão sem alterar seu preço.</p></div>';
      const copy=$('#copyProduct');if(copy)copy.addEventListener('click',async()=>{
        const target=url||location.href;
        try{await navigator.clipboard.writeText(target);toast('Link copiado');}catch{toast('Não foi possível copiar o link');}
      });
    }catch{$('#dialogContent').innerHTML='<div class="dialog-content"><h2 id="dialogTitle">Não conseguimos abrir a análise.</h2><p class="fineprint">A conexão pode estar temporariamente indisponível. Você pode fechar e tentar novamente.</p></div>';}
  }
  document.addEventListener('click',(e)=>{
    const b=e.target.closest('[data-details]');if(b){openDetails(b.dataset.details);return;}
    const c=e.target.closest('[data-category]');if(c){state.category=c.dataset.category;applyFilters();return;}
    if(e.target.closest('#resetFilters')){state.q='';state.category='';state.sort='recent';$('#catalogInput').value='';$('#heroInput').value='';$('#sortSelect').value='recent';applyFilters();}
    if(e.target.closest('#retryLoad'))load(false);
  });
  $('#closeDialog').addEventListener('click',()=>$('#productDialog').close());
  $('#productDialog').addEventListener('click',(e)=>{if(e.target===$('#productDialog'))e.target.close();});
  const update=delay((value)=>{state.q=value.trim().slice(0,80);state.page=1;load(false);},260);
  $('#catalogInput').addEventListener('input',(e)=>{update(e.target.value);});
  $('#heroSearch').addEventListener('submit',(e)=>{e.preventDefault();const v=$('#heroInput').value.trim();state.q=v;$('#catalogInput').value=v;state.page=1;load(false);$('#catalogo').scrollIntoView({behavior:'smooth'});});
  $('#sortSelect').addEventListener('change',(e)=>{state.sort=e.target.value;applyFilters();});
  $('#loadMore').addEventListener('click',()=>{if(state.loading)return;state.page++;load(true);});
  load(false);
})();
