import{t as e}from"./modulepreload-polyfill-MGmjhzsv.js";e((()=>{var e=3,t=3,n=[{title:`El primer mandato`,text:`El castillo solo concede nueve decisiones. Elige dados que conviertan pocos recursos en presencia duradera.`},{title:`Tempo del puente`,text:`Un dado alto acelera una orden cara; un dado bajo puede financiar el siguiente turno. La mejor jugada mira dos turnos adelante.`},{title:`La triple presencia`,text:`Cortesanos, guerreros y jardineros puntuan de formas distintas. Un clan fuerte no depende de una sola sala.`},{title:`Cierre de era`,text:`En la tercera ronda, los recursos sin convertir pesan poco. Cambia arroz, hierro y nacar por honor antes de la audiencia final.`}],r={strategy:`
    <ul>
      <li>Prioriza acciones que coloquen piezas: suelen abrir puntos inmediatos y final de partida.</li>
      <li>Si tienes poco dinero, usa una diferencia positiva de dado para financiar el siguiente despliegue.</li>
      <li>En ronda 1 conviene jardin o patio; en ronda 2 castillo; en ronda 3 convierte recursos en honor.</li>
      <li>El asistente valora cada jugada por puntos, recursos futuros y equilibrio del clan.</li>
    </ul>
  `,rules:`
    <ul>
      <li>La partida de entrenamiento dura 3 rondas con 3 turnos por ronda.</li>
      <li>Elige un dado de un puente y ejecuta una orden compatible con su color.</li>
      <li>Si el dado supera el valor de la orden, recibes monedas extra; si queda por debajo, pagas la diferencia.</li>
      <li>Al final se puntuan piezas colocadas, influencia y recursos restantes.</li>
    </ul>
  `,history:`
    <ul>
      <li>Tu clan busca reconocimiento alrededor del castillo de Himeji durante el periodo Edo.</li>
      <li>Los cortesanos negocian en salones, los guerreros sostienen el prestigio militar y los jardineros cuidan rutas de influencia.</li>
      <li>La narracion usa contexto historico propio para estudiar decisiones, no reproduce textos ni ilustraciones oficiales.</li>
    </ul>
  `},i=[{id:`audience`,name:`Audiencia en el tenshu`,color:`white`,value:5,area:`Castillo`,cost:{pearl:1,coins:2},reward:{score:7,influence:2,courtiers:1},advice:`Gran conversion de nacar en honor. Buena si ya puedes pagarla sin vaciar todo el clan.`},{id:`scribe`,name:`Registro del palacio`,color:`white`,value:3,area:`Castillo`,cost:{coins:1},reward:{score:4,influence:1,courtiers:1,pearl:1},advice:`La mejor entrada al castillo: coloca cortesano, recupera nacar y mantiene opciones abiertas.`},{id:`tax`,name:`Tributo provincial`,color:`white`,value:2,area:`Dominio`,cost:{},reward:{coins:3,rice:1,score:1},advice:`Jugada de preparacion. No brilla, pero sostiene turnos caros y evita quedarte sin monedas.`},{id:`pond`,name:`Jardin del estanque`,color:`red`,value:4,area:`Jardin`,cost:{rice:2},reward:{score:5,influence:1,gardeners:1,pearl:1},advice:`Excelente apertura si tienes arroz. El jardin te da puntos y prepara acciones de alto valor.`},{id:`tea`,name:`Sendero del te`,color:`red`,value:3,area:`Jardin`,cost:{rice:1,coins:1},reward:{score:3,gardeners:1,iron:1,influence:1},advice:`Equilibrada y flexible. Conviene cuando quieres hierro sin abandonar la presencia del jardin.`},{id:`harvest`,name:`Cosecha del clan`,color:`red`,value:2,area:`Dominio`,cost:{},reward:{rice:3,coins:1,score:1},advice:`Recarga arroz para acciones de jardin. Es especialmente buena antes de un dado rojo alto.`},{id:`barracks`,name:`Patio de armas`,color:`black`,value:4,area:`Patio`,cost:{iron:2},reward:{score:6,warriors:1,influence:1},advice:`Convierte hierro en puntos directos. Ideal si los rivales empiezan a ganar demasiada influencia.`},{id:`dojo`,name:`Dojo de lanceros`,color:`black`,value:3,area:`Patio`,cost:{iron:1,coins:1},reward:{score:4,warriors:1,rice:1},advice:`Una accion limpia para poner guerrero y mantener arroz. Buen punto medio en ronda 1 o 2.`},{id:`forge`,name:`Forja del herrero`,color:`black`,value:2,area:`Dominio`,cost:{},reward:{iron:3,coins:1,score:1},advice:`Prepara patio de armas. Si no tienes hierro, esta accion evita turnos militares muertos.`}],a=()=>({round:1,turn:1,selectedDie:null,selectedActionId:null,lessonIndex:0,score:0,coins:5,rice:3,iron:2,pearl:1,influence:0,warriors:0,gardeners:0,courtiers:0,dice:l(),usedActions:[],log:[`El clan llega a Himeji con una pequena escolta, arroz medido y una oportunidad ante el daimio.`],rivals:[{name:`Clan Sakai`,score:7,focus:`Castillo`},{name:`Clan Honda`,score:6,focus:`Patio`}]}),o=a(),s=e=>document.querySelector(e),c={roundLabel:s(`#roundLabel`),turnLabel:s(`#turnLabel`),score:s(`#scoreValue`),coins:s(`#coinsValue`),rice:s(`#riceValue`),iron:s(`#ironValue`),pearl:s(`#pearlValue`),influence:s(`#influenceValue`),lessonTitle:s(`#lessonTitle`),lessonText:s(`#lessonText`),diceMarket:s(`#diceMarket`),actionBoard:s(`#actionBoard`),assistant:s(`#assistantMessage`),advisorGrid:s(`#advisorGrid`),tabPanel:s(`#tabPanel`),log:s(`#gameLog`),clanBoard:s(`#clanBoard`),rivals:s(`#rivals`),confirm:s(`#confirmButton`),undo:s(`#undoButton`),resultDialog:s(`#resultDialog`),resultTitle:s(`#resultTitle`),resultText:s(`#resultText`)};function l(){return[`white`,`red`,`black`].map((e,t)=>({id:`bridge-${t}`,color:e,name:[`Puente de garzas`,`Puente del arce`,`Puente de hierro`][t],dice:Array.from({length:3},(n,r)=>({id:`${e}-${t}-${r}-${Date.now()}-${Math.random()}`,color:e,value:Math.ceil(Math.random()*6),used:!1})).sort((e,t)=>e.value-t.value)}))}function u(e={}){let t={coins:`monedas`,rice:`arroz`,iron:`hierro`,pearl:`nacar`,influence:`influencia`,score:`honor`,warriors:`guerrero`,gardeners:`jardinero`,courtiers:`cortesano`};return Object.entries(e).filter(([,e])=>e).map(([e,n])=>`${n} ${t[e]}`).join(`, `)||`sin coste`}function d(e,t,n){let r=f(e,t,n);return Object.entries(r).every(([e,t])=>o[e]>=t)}function f(e,t,n){let r={...e},i=t?t.value-n.value:0;return i<0&&(r.coins=(r.coins||0)+Math.abs(i)),r}function p(e,t){let n=e.value-t.value;return n>0?n:0}function m(e,t){let n=f(t.cost,e,t);if(!d(t.cost,e,t))return{die:e,action:t,value:-99,reason:`Faltan recursos para pagar ${u(n)}.`};let r=t.reward,i=(r.warriors||0)*3+(r.gardeners||0)*3+(r.courtiers||0)*4,a=(r.coins||0)*.55+(r.rice||0)*.75+(r.iron||0)*.85+(r.pearl||0)*1.2+p(e,t)*.45,s=Math.min(o.warriors+(r.warriors||0),3)+Math.min(o.gardeners+(r.gardeners||0),3)+Math.min(o.courtiers+(r.courtiers||0),3),c=o.round===3?(r.score||0)*.6:a,l=(r.score||0)+(r.influence||0)*1.4+i+a+s*.35+c;return{die:e,action:t,value:l,reason:`${t.name}: ${t.advice} Valor estimado ${l.toFixed(1)}.`}}function h(){let e=[];for(let t of o.dice)for(let n of t.dice)if(!n.used)for(let t of i)t.color===n.color&&(o.usedActions.includes(t.id)||e.push(m(n,t)));return e.sort((e,t)=>t.value-e.value)}function g(){c.roundLabel.textContent=`Ronda ${o.round} de ${e}`,c.turnLabel.textContent=`Turno ${o.turn} de ${t}`,c.score.textContent=o.score,c.coins.textContent=o.coins,c.rice.textContent=o.rice,c.iron.textContent=o.iron,c.pearl.textContent=o.pearl,c.influence.textContent=o.influence;let r=n[o.lessonIndex];c.lessonTitle.textContent=r.title,c.lessonText.textContent=r.text,_(),v(),y(),b(),x(),S(),c.confirm.disabled=!(o.selectedDie&&o.selectedActionId)}function _(){c.diceMarket.innerHTML=o.dice.map(e=>`
        <article class="bridge">
          <h3>${e.name}</h3>
          <div class="bridge-row">
            ${e.dice.map(e=>`
                  <button
                    class="die ${o.selectedDie?.id===e.id?`selected`:``}"
                    data-die="${e.id}"
                    data-color="${e.color}"
                    ${e.used?`disabled`:``}
                    type="button"
                    aria-label="Dado ${e.color} de valor ${e.value}"
                  >
                    ${e.value}
                  </button>
                `).join(``)}
          </div>
        </article>
      `).join(``),c.diceMarket.querySelectorAll(`[data-die]`).forEach(e=>{e.addEventListener(`click`,()=>C(e.dataset.die))})}function v(){c.actionBoard.innerHTML=i.map(e=>{let t=o.selectedDie,n=t&&t.color===e.color,r=o.usedActions.includes(e.id),i=t?f(e.cost,t,e):e.cost,a=t&&n?p(t,e):0,s=t&&n&&!r&&d(e.cost,t,e);return`
        <button
          class="action-card ${o.selectedActionId===e.id?`selected`:``}"
          data-action="${e.id}"
          ${s?``:`disabled`}
          type="button"
        >
          <span>
            <strong>${e.name}</strong>
            <p>${e.area}. Coste: ${u(i)}. Recompensa: ${u(e.reward)}.</p>
          </span>
          <span class="tag-row">
            <span class="tag">${e.color}</span>
            <span class="tag">valor ${e.value}</span>
            ${a?`<span class="tag">+${a} monedas</span>`:``}
            ${r?`<span class="tag">ocupada</span>`:``}
          </span>
        </button>
      `}).join(``),c.actionBoard.querySelectorAll(`[data-action]`).forEach(e=>{e.addEventListener(`click`,()=>w(e.dataset.action))})}function y(){let e=h().slice(0,3);if(c.advisorGrid.innerHTML=e.map((e,t)=>`
        <article class="advisor-move">
          <strong>${t+1}. Dado ${e.die.value} -> ${e.action.name}</strong>
          <span>${e.reason}</span>
        </article>
      `).join(``),!o.selectedDie){c.assistant.textContent=`Elige un dado. Buscare la orden que mejor equilibre honor inmediato, recursos futuros y presencia del clan.`;return}let t=i.filter(e=>e.color===o.selectedDie.color&&!o.usedActions.includes(e.id)).map(e=>m(o.selectedDie,e)).sort((e,t)=>t.value-e.value)[0];c.assistant.textContent=t?`Con el dado ${o.selectedDie.value}, mi lectura es: ${t.reason}`:`Ese dado ya no tiene ordenes disponibles. Conviene cambiar seleccion.`}function b(){let e=[[`Guerreros`,`warriors`,5],[`Jardineros`,`gardeners`,5],[`Cortesanos`,`courtiers`,5]];c.clanBoard.innerHTML=e.map(([e,t,n])=>`
        <div class="clan-item">
          <strong>${e}</strong>
          <span class="piece-track">
            ${Array.from({length:n},(e,n)=>`<span class="piece ${n<o[t]?`used`:``}"></span>`).join(``)}
          </span>
        </div>
      `).join(``)}function x(){c.rivals.innerHTML=o.rivals.map(e=>`
        <article class="rival-card">
          <span>${e.name}<br><small>${e.focus}</small></span>
          <strong>${e.score}</strong>
        </article>
      `).join(``)}function S(){c.log.innerHTML=o.log.slice(-8).map(e=>`<li>${e}</li>`).join(``)}function C(e){let t=o.dice.flatMap(e=>e.dice).find(t=>t.id===e);o.selectedDie=t,o.selectedActionId=null,g()}function w(e){o.selectedActionId=e,g()}function T(){if(!o.selectedDie||!o.selectedActionId)return;let e=i.find(e=>e.id===o.selectedActionId);if(!e||!d(e.cost,o.selectedDie,e))return;let t=f(e.cost,o.selectedDie,e);for(let[e,n]of Object.entries(t))o[e]-=n;let n=p(o.selectedDie,e);o.coins+=n;for(let[t,n]of Object.entries(e.reward))o[t]+=n;o.selectedDie.used=!0,o.usedActions.push(e.id),o.log.push(`R${o.round}T${o.turn}: orden ${e.name} con dado ${o.selectedDie.value}. Coste ${u(t)}, recompensa ${u(e.reward)}${n?` y ${n} monedas del puente`:``}.`),E(e),o.selectedDie=null,o.selectedActionId=null,D(),g()}function E(e){o.rivals=o.rivals.map(t=>{let n=t.focus===e.area?2:0,r=Math.ceil(Math.random()*2)+o.round+n;return{...t,score:t.score+r}})}function D(){if(o.turn<t){o.turn+=1;return}if(o.round<e){o.round+=1,o.turn=1,o.dice=l(),o.usedActions=[],o.lessonIndex=Math.min(o.lessonIndex+1,n.length-1),o.log.push(`Amanece la ronda ${o.round}. Los puentes se vuelven a llenar y las salas del castillo abren nuevas oportunidades.`);return}O()}function O(){let e=o.warriors*2+o.gardeners*2+o.courtiers*3+o.influence*2+Math.floor((o.coins+o.rice+o.iron+o.pearl*2)/3);o.score+=e;let t=Math.max(...o.rivals.map(e=>e.score)),n=o.score>=t?`Tu clan sale de la audiencia con prestigio superior al de sus rivales.`:`El clan obtiene honor, pero los rivales aun dominan la corte. Revisa si convertiste recursos demasiado tarde.`;c.resultTitle.textContent=o.score>=t?`Victoria del clan`:`Leccion del castillo`,c.resultText.textContent=`${n} Puntuacion final: ${o.score}. Bono final aplicado: ${e}.`,c.resultDialog.showModal()}function k(){o.selectedDie=null,o.selectedActionId=null,g()}function A(){o=a(),c.resultDialog.close(),g()}function j(){let e=h()[0];if(!e){c.assistant.textContent=`No encuentro jugadas legales con tus recursos actuales. Usa nueva partida para reiniciar el ejercicio.`;return}o.selectedDie=e.die,o.selectedActionId=e.action.id,c.assistant.textContent=`Sugiero ejecutar ${e.action.name} con dado ${e.die.value}. ${e.reason}`,g()}function M(){o.lessonIndex=(o.lessonIndex+1)%n.length,g()}function N(e){document.querySelectorAll(`.tab`).forEach(t=>t.classList.toggle(`active`,t.dataset.tab===e)),c.tabPanel.innerHTML=r[e]}s(`#confirmButton`).addEventListener(`click`,T),s(`#undoButton`).addEventListener(`click`,k),s(`#newGameButton`).addEventListener(`click`,A),s(`#hintButton`).addEventListener(`click`,j),s(`#lessonButton`).addEventListener(`click`,M),s(`#closeResultButton`).addEventListener(`click`,()=>c.resultDialog.close()),document.querySelectorAll(`.tab`).forEach(e=>{e.addEventListener(`click`,()=>N(e.dataset.tab))}),N(`strategy`),g()}))();