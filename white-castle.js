const MAX_ROUNDS = 3;
const TURNS_PER_ROUND = 3;

const lessons = [
  {
    title: "El primer mandato",
    text:
      "El castillo solo concede nueve decisiones. Elige dados que conviertan pocos recursos en presencia duradera.",
  },
  {
    title: "Tempo del puente",
    text:
      "Un dado alto acelera una orden cara; un dado bajo puede financiar el siguiente turno. La mejor jugada mira dos turnos adelante.",
  },
  {
    title: "La triple presencia",
    text:
      "Cortesanos, guerreros y jardineros puntuan de formas distintas. Un clan fuerte no depende de una sola sala.",
  },
  {
    title: "Cierre de era",
    text:
      "En la tercera ronda, los recursos sin convertir pesan poco. Cambia arroz, hierro y nacar por honor antes de la audiencia final.",
  },
];

const tabCopy = {
  strategy: `
    <ul>
      <li>Prioriza acciones que coloquen piezas: suelen abrir puntos inmediatos y final de partida.</li>
      <li>Si tienes poco dinero, usa una diferencia positiva de dado para financiar el siguiente despliegue.</li>
      <li>En ronda 1 conviene jardin o patio; en ronda 2 castillo; en ronda 3 convierte recursos en honor.</li>
      <li>El asistente valora cada jugada por puntos, recursos futuros y equilibrio del clan.</li>
    </ul>
  `,
  rules: `
    <ul>
      <li>La partida de entrenamiento dura 3 rondas con 3 turnos por ronda.</li>
      <li>Elige un dado de un puente y ejecuta una orden compatible con su color.</li>
      <li>Si el dado supera el valor de la orden, recibes monedas extra; si queda por debajo, pagas la diferencia.</li>
      <li>Al final se puntuan piezas colocadas, influencia y recursos restantes.</li>
    </ul>
  `,
  history: `
    <ul>
      <li>Tu clan busca reconocimiento alrededor del castillo de Himeji durante el periodo Edo.</li>
      <li>Los cortesanos negocian en salones, los guerreros sostienen el prestigio militar y los jardineros cuidan rutas de influencia.</li>
      <li>La narracion usa contexto historico propio para estudiar decisiones, no reproduce textos ni ilustraciones oficiales.</li>
    </ul>
  `,
};

const actions = [
  {
    id: "audience",
    name: "Audiencia en el tenshu",
    color: "white",
    value: 5,
    area: "Castillo",
    cost: { pearl: 1, coins: 2 },
    reward: { score: 7, influence: 2, courtiers: 1 },
    advice:
      "Gran conversion de nacar en honor. Buena si ya puedes pagarla sin vaciar todo el clan.",
  },
  {
    id: "scribe",
    name: "Registro del palacio",
    color: "white",
    value: 3,
    area: "Castillo",
    cost: { coins: 1 },
    reward: { score: 4, influence: 1, courtiers: 1, pearl: 1 },
    advice:
      "La mejor entrada al castillo: coloca cortesano, recupera nacar y mantiene opciones abiertas.",
  },
  {
    id: "tax",
    name: "Tributo provincial",
    color: "white",
    value: 2,
    area: "Dominio",
    cost: {},
    reward: { coins: 3, rice: 1, score: 1 },
    advice:
      "Jugada de preparacion. No brilla, pero sostiene turnos caros y evita quedarte sin monedas.",
  },
  {
    id: "pond",
    name: "Jardin del estanque",
    color: "red",
    value: 4,
    area: "Jardin",
    cost: { rice: 2 },
    reward: { score: 5, influence: 1, gardeners: 1, pearl: 1 },
    advice:
      "Excelente apertura si tienes arroz. El jardin te da puntos y prepara acciones de alto valor.",
  },
  {
    id: "tea",
    name: "Sendero del te",
    color: "red",
    value: 3,
    area: "Jardin",
    cost: { rice: 1, coins: 1 },
    reward: { score: 3, gardeners: 1, iron: 1, influence: 1 },
    advice:
      "Equilibrada y flexible. Conviene cuando quieres hierro sin abandonar la presencia del jardin.",
  },
  {
    id: "harvest",
    name: "Cosecha del clan",
    color: "red",
    value: 2,
    area: "Dominio",
    cost: {},
    reward: { rice: 3, coins: 1, score: 1 },
    advice:
      "Recarga arroz para acciones de jardin. Es especialmente buena antes de un dado rojo alto.",
  },
  {
    id: "barracks",
    name: "Patio de armas",
    color: "black",
    value: 4,
    area: "Patio",
    cost: { iron: 2 },
    reward: { score: 6, warriors: 1, influence: 1 },
    advice:
      "Convierte hierro en puntos directos. Ideal si los rivales empiezan a ganar demasiada influencia.",
  },
  {
    id: "dojo",
    name: "Dojo de lanceros",
    color: "black",
    value: 3,
    area: "Patio",
    cost: { iron: 1, coins: 1 },
    reward: { score: 4, warriors: 1, rice: 1 },
    advice:
      "Una accion limpia para poner guerrero y mantener arroz. Buen punto medio en ronda 1 o 2.",
  },
  {
    id: "forge",
    name: "Forja del herrero",
    color: "black",
    value: 2,
    area: "Dominio",
    cost: {},
    reward: { iron: 3, coins: 1, score: 1 },
    advice:
      "Prepara patio de armas. Si no tienes hierro, esta accion evita turnos militares muertos.",
  },
];

const startingState = () => ({
  round: 1,
  turn: 1,
  selectedDie: null,
  selectedActionId: null,
  lessonIndex: 0,
  score: 0,
  coins: 5,
  rice: 3,
  iron: 2,
  pearl: 1,
  influence: 0,
  warriors: 0,
  gardeners: 0,
  courtiers: 0,
  dice: rollMarket(),
  usedActions: [],
  log: [
    "El clan llega a Himeji con una pequena escolta, arroz medido y una oportunidad ante el daimio.",
  ],
  rivals: [
    { name: "Clan Sakai", score: 7, focus: "Castillo" },
    { name: "Clan Honda", score: 6, focus: "Patio" },
  ],
});

let state = startingState();

const $ = (selector) => document.querySelector(selector);

const els = {
  roundLabel: $("#roundLabel"),
  turnLabel: $("#turnLabel"),
  score: $("#scoreValue"),
  coins: $("#coinsValue"),
  rice: $("#riceValue"),
  iron: $("#ironValue"),
  pearl: $("#pearlValue"),
  influence: $("#influenceValue"),
  lessonTitle: $("#lessonTitle"),
  lessonText: $("#lessonText"),
  diceMarket: $("#diceMarket"),
  actionBoard: $("#actionBoard"),
  assistant: $("#assistantMessage"),
  advisorGrid: $("#advisorGrid"),
  tabPanel: $("#tabPanel"),
  log: $("#gameLog"),
  clanBoard: $("#clanBoard"),
  rivals: $("#rivals"),
  confirm: $("#confirmButton"),
  undo: $("#undoButton"),
  resultDialog: $("#resultDialog"),
  resultTitle: $("#resultTitle"),
  resultText: $("#resultText"),
};

function rollMarket() {
  const colors = ["white", "red", "black"];
  return colors.map((color, bridgeIndex) => ({
    id: `bridge-${bridgeIndex}`,
    color,
    name: ["Puente de garzas", "Puente del arce", "Puente de hierro"][
      bridgeIndex
    ],
    dice: Array.from({ length: 3 }, (_, dieIndex) => ({
      id: `${color}-${bridgeIndex}-${dieIndex}-${Date.now()}-${Math.random()}`,
      color,
      value: Math.ceil(Math.random() * 6),
      used: false,
    })).sort((a, b) => a.value - b.value),
  }));
}

function resourceText(bundle = {}) {
  const labels = {
    coins: "monedas",
    rice: "arroz",
    iron: "hierro",
    pearl: "nacar",
    influence: "influencia",
    score: "honor",
    warriors: "guerrero",
    gardeners: "jardinero",
    courtiers: "cortesano",
  };
  return Object.entries(bundle)
    .filter(([, value]) => value)
    .map(([key, value]) => `${value} ${labels[key]}`)
    .join(", ") || "sin coste";
}

function canPay(cost, die, action) {
  const adjusted = adjustedCost(cost, die, action);
  return Object.entries(adjusted).every(([key, value]) => state[key] >= value);
}

function adjustedCost(cost, die, action) {
  const result = { ...cost };
  const diff = die ? die.value - action.value : 0;
  if (diff < 0) {
    result.coins = (result.coins || 0) + Math.abs(diff);
  }
  return result;
}

function bridgeBonus(die, action) {
  const diff = die.value - action.value;
  return diff > 0 ? diff : 0;
}

function evaluateMove(die, action) {
  const cost = adjustedCost(action.cost, die, action);
  if (!canPay(action.cost, die, action)) {
    return {
      die,
      action,
      value: -99,
      reason: `Faltan recursos para pagar ${resourceText(cost)}.`,
    };
  }

  const reward = action.reward;
  const pieceValue =
    (reward.warriors || 0) * 3 +
    (reward.gardeners || 0) * 3 +
    (reward.courtiers || 0) * 4;
  const resourceValue =
    (reward.coins || 0) * 0.55 +
    (reward.rice || 0) * 0.75 +
    (reward.iron || 0) * 0.85 +
    (reward.pearl || 0) * 1.2 +
    bridgeBonus(die, action) * 0.45;
  const balance =
    Math.min(state.warriors + (reward.warriors || 0), 3) +
    Math.min(state.gardeners + (reward.gardeners || 0), 3) +
    Math.min(state.courtiers + (reward.courtiers || 0), 3);
  const urgency = state.round === 3 ? (reward.score || 0) * 0.6 : resourceValue;
  const value =
    (reward.score || 0) +
    (reward.influence || 0) * 1.4 +
    pieceValue +
    resourceValue +
    balance * 0.35 +
    urgency;

  return {
    die,
    action,
    value,
    reason:
      `${action.name}: ${action.advice} Valor estimado ${value.toFixed(1)}.`,
  };
}

function legalMoves() {
  const moves = [];
  for (const bridge of state.dice) {
    for (const die of bridge.dice) {
      if (die.used) continue;
      for (const action of actions) {
        if (action.color !== die.color) continue;
        if (state.usedActions.includes(action.id)) continue;
        moves.push(evaluateMove(die, action));
      }
    }
  }
  return moves.sort((a, b) => b.value - a.value);
}

function render() {
  els.roundLabel.textContent = `Ronda ${state.round} de ${MAX_ROUNDS}`;
  els.turnLabel.textContent = `Turno ${state.turn} de ${TURNS_PER_ROUND}`;
  els.score.textContent = state.score;
  els.coins.textContent = state.coins;
  els.rice.textContent = state.rice;
  els.iron.textContent = state.iron;
  els.pearl.textContent = state.pearl;
  els.influence.textContent = state.influence;

  const lesson = lessons[state.lessonIndex];
  els.lessonTitle.textContent = lesson.title;
  els.lessonText.textContent = lesson.text;

  renderDice();
  renderActions();
  renderAdvisor();
  renderClan();
  renderRivals();
  renderLog();
  els.confirm.disabled = !(state.selectedDie && state.selectedActionId);
}

function renderDice() {
  els.diceMarket.innerHTML = state.dice
    .map(
      (bridge) => `
        <article class="bridge">
          <h3>${bridge.name}</h3>
          <div class="bridge-row">
            ${bridge.dice
              .map(
                (die) => `
                  <button
                    class="die ${state.selectedDie?.id === die.id ? "selected" : ""}"
                    data-die="${die.id}"
                    data-color="${die.color}"
                    ${die.used ? "disabled" : ""}
                    type="button"
                    aria-label="Dado ${die.color} de valor ${die.value}"
                  >
                    ${die.value}
                  </button>
                `,
              )
              .join("")}
          </div>
        </article>
      `,
    )
    .join("");

  els.diceMarket.querySelectorAll("[data-die]").forEach((button) => {
    button.addEventListener("click", () => selectDie(button.dataset.die));
  });
}

function renderActions() {
  els.actionBoard.innerHTML = actions
    .map((action) => {
      const die = state.selectedDie;
      const compatible = die && die.color === action.color;
      const unavailable = state.usedActions.includes(action.id);
      const cost = die ? adjustedCost(action.cost, die, action) : action.cost;
      const bonus = die && compatible ? bridgeBonus(die, action) : 0;
      const payable = die && compatible && !unavailable && canPay(action.cost, die, action);
      return `
        <button
          class="action-card ${state.selectedActionId === action.id ? "selected" : ""}"
          data-action="${action.id}"
          ${!payable ? "disabled" : ""}
          type="button"
        >
          <span>
            <strong>${action.name}</strong>
            <p>${action.area}. Coste: ${resourceText(cost)}. Recompensa: ${resourceText(action.reward)}.</p>
          </span>
          <span class="tag-row">
            <span class="tag">${action.color}</span>
            <span class="tag">valor ${action.value}</span>
            ${bonus ? `<span class="tag">+${bonus} monedas</span>` : ""}
            ${unavailable ? `<span class="tag">ocupada</span>` : ""}
          </span>
        </button>
      `;
    })
    .join("");

  els.actionBoard.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => selectAction(button.dataset.action));
  });
}

function renderAdvisor() {
  const moves = legalMoves().slice(0, 3);
  els.advisorGrid.innerHTML = moves
    .map(
      (move, index) => `
        <article class="advisor-move">
          <strong>${index + 1}. Dado ${move.die.value} -> ${move.action.name}</strong>
          <span>${move.reason}</span>
        </article>
      `,
    )
    .join("");

  if (!state.selectedDie) {
    els.assistant.textContent =
      "Elige un dado. Buscare la orden que mejor equilibre honor inmediato, recursos futuros y presencia del clan.";
    return;
  }

  const bestForDie = actions
    .filter(
      (action) =>
        action.color === state.selectedDie.color &&
        !state.usedActions.includes(action.id),
    )
    .map((action) => evaluateMove(state.selectedDie, action))
    .sort((a, b) => b.value - a.value)[0];

  els.assistant.textContent = bestForDie
    ? `Con el dado ${state.selectedDie.value}, mi lectura es: ${bestForDie.reason}`
    : "Ese dado ya no tiene ordenes disponibles. Conviene cambiar seleccion.";
}

function renderClan() {
  const tracks = [
    ["Guerreros", "warriors", 5],
    ["Jardineros", "gardeners", 5],
    ["Cortesanos", "courtiers", 5],
  ];

  els.clanBoard.innerHTML = tracks
    .map(
      ([label, key, max]) => `
        <div class="clan-item">
          <strong>${label}</strong>
          <span class="piece-track">
            ${Array.from({ length: max }, (_, index) =>
              `<span class="piece ${index < state[key] ? "used" : ""}"></span>`,
            ).join("")}
          </span>
        </div>
      `,
    )
    .join("");
}

function renderRivals() {
  els.rivals.innerHTML = state.rivals
    .map(
      (rival) => `
        <article class="rival-card">
          <span>${rival.name}<br><small>${rival.focus}</small></span>
          <strong>${rival.score}</strong>
        </article>
      `,
    )
    .join("");
}

function renderLog() {
  els.log.innerHTML = state.log
    .slice(-8)
    .map((entry) => `<li>${entry}</li>`)
    .join("");
}

function selectDie(id) {
  const die = state.dice.flatMap((bridge) => bridge.dice).find((item) => item.id === id);
  state.selectedDie = die;
  state.selectedActionId = null;
  render();
}

function selectAction(id) {
  state.selectedActionId = id;
  render();
}

function executeOrder() {
  if (!state.selectedDie || !state.selectedActionId) return;
  const action = actions.find((item) => item.id === state.selectedActionId);
  if (!action || !canPay(action.cost, state.selectedDie, action)) return;

  const cost = adjustedCost(action.cost, state.selectedDie, action);
  for (const [key, value] of Object.entries(cost)) {
    state[key] -= value;
  }

  const bonus = bridgeBonus(state.selectedDie, action);
  state.coins += bonus;
  for (const [key, value] of Object.entries(action.reward)) {
    state[key] += value;
  }

  state.selectedDie.used = true;
  state.usedActions.push(action.id);
  state.log.push(
    `R${state.round}T${state.turn}: orden ${action.name} con dado ${state.selectedDie.value}. Coste ${resourceText(cost)}, recompensa ${resourceText(action.reward)}${bonus ? ` y ${bonus} monedas del puente` : ""}.`,
  );
  advanceRivals(action);
  state.selectedDie = null;
  state.selectedActionId = null;
  advanceTurn();
  render();
}

function advanceRivals(action) {
  state.rivals = state.rivals.map((rival) => {
    const focusMatch = rival.focus === action.area ? 2 : 0;
    const pressure = Math.ceil(Math.random() * 2) + state.round + focusMatch;
    return { ...rival, score: rival.score + pressure };
  });
}

function advanceTurn() {
  if (state.turn < TURNS_PER_ROUND) {
    state.turn += 1;
    return;
  }

  if (state.round < MAX_ROUNDS) {
    state.round += 1;
    state.turn = 1;
    state.dice = rollMarket();
    state.usedActions = [];
    state.lessonIndex = Math.min(state.lessonIndex + 1, lessons.length - 1);
    state.log.push(
      `Amanece la ronda ${state.round}. Los puentes se vuelven a llenar y las salas del castillo abren nuevas oportunidades.`,
    );
    return;
  }

  finishGame();
}

function finishGame() {
  const finalBonus =
    state.warriors * 2 +
    state.gardeners * 2 +
    state.courtiers * 3 +
    state.influence * 2 +
    Math.floor((state.coins + state.rice + state.iron + state.pearl * 2) / 3);
  state.score += finalBonus;
  const bestRival = Math.max(...state.rivals.map((rival) => rival.score));
  const result =
    state.score >= bestRival
      ? "Tu clan sale de la audiencia con prestigio superior al de sus rivales."
      : "El clan obtiene honor, pero los rivales aun dominan la corte. Revisa si convertiste recursos demasiado tarde.";
  els.resultTitle.textContent =
    state.score >= bestRival ? "Victoria del clan" : "Leccion del castillo";
  els.resultText.textContent =
    `${result} Puntuacion final: ${state.score}. Bono final aplicado: ${finalBonus}.`;
  els.resultDialog.showModal();
}

function resetSelection() {
  state.selectedDie = null;
  state.selectedActionId = null;
  render();
}

function newGame() {
  state = startingState();
  els.resultDialog.close();
  render();
}

function suggestMove() {
  const best = legalMoves()[0];
  if (!best) {
    els.assistant.textContent =
      "No encuentro jugadas legales con tus recursos actuales. Usa nueva partida para reiniciar el ejercicio.";
    return;
  }
  state.selectedDie = best.die;
  state.selectedActionId = best.action.id;
  els.assistant.textContent =
    `Sugiero ejecutar ${best.action.name} con dado ${best.die.value}. ${best.reason}`;
  render();
}

function cycleLesson() {
  state.lessonIndex = (state.lessonIndex + 1) % lessons.length;
  render();
}

function setTab(tab) {
  document
    .querySelectorAll(".tab")
    .forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  els.tabPanel.innerHTML = tabCopy[tab];
}

$("#confirmButton").addEventListener("click", executeOrder);
$("#undoButton").addEventListener("click", resetSelection);
$("#newGameButton").addEventListener("click", newGame);
$("#hintButton").addEventListener("click", suggestMove);
$("#lessonButton").addEventListener("click", cycleLesson);
$("#closeResultButton").addEventListener("click", () => els.resultDialog.close());
document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});

setTab("strategy");
render();
