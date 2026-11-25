import { randomUUID } from 'node:crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fiveTwoWeeks, fiveTwoSundays, fiveTwoEntries } from '../server/schedules/five-two.js';
import { applyHomologServerEnv, assertHomologSafety, HOMOLOG_PROJECT_ID, HOMOLOG_UNIT_ID, HOMOLOG_FIRESTORE_HOST, HOMOLOG_FIRESTORE_PORT, HOMOLOG_AUTH_HOST, HOMOLOG_AUTH_PORT, waitForHttp } from './homolog-env.mjs';

applyHomologServerEnv(process.env);
assertHomologSafety(process.env);

await waitForHttp(`http://${HOMOLOG_FIRESTORE_HOST}:${HOMOLOG_FIRESTORE_PORT}/`, { timeoutMs: 20000 });
await waitForHttp(`http://${HOMOLOG_AUTH_HOST}:${HOMOLOG_AUTH_PORT}/`, { timeoutMs: 20000 });

if (!getApps().length) initializeApp({ projectId: HOMOLOG_PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const [cy, cm] = today.split('-').map(Number);
const period = `${cy}-${String(cm).padStart(2, '0')}`;
const nextMonthDate = new Date(Date.UTC(cy, cm, 1, 12, 0, 0));
const nextPeriod = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;

const plusDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekDayCode = (dateStr) => ['dom','seg','ter','qua','qui','sex','sab'][new Date(dateStr + 'T12:00:00Z').getUTCDay()];

function availability(days, start, end, breakStart = null, breakEnd = null) {
  return days.map(day => ({ day, start, end, ...(breakStart && breakEnd ? { breakStart, breakEnd } : {}) }));
}

const staffDefs = [
  { key: 'gerente', name: 'Helena Gerente', email: 'gerente@homolog.local', role: 'manager', sector: 'gestao', jobTitle: 'Gerente', shift: 'manha', skills: ['gestao'], certifications: ['lideranca'], weekdays: ['seg','ter','qua','qui','sex'], start: '08:00', end: '16:20', pair: 0 },
  { key: 'subgerente', name: 'Sergio Subgerente', email: 'subgerente@homolog.local', role: 'submanager', sector: 'gestao', jobTitle: 'Subgerente', shift: 'noite', skills: ['gestao'], certifications: ['lideranca'], weekdays: ['seg','ter','qua','qui','sex'], start: '14:00', end: '22:20', pair: 1 },
  { key: 'cozinheiro1', name: 'Carla Cozinheira', email: 'cozinheira1@homolog.local', role: 'cook', sector: 'cozinha', jobTitle: 'Cozinheira', shift: 'manha', skills: ['chapa','preparo'], certifications: ['montagem','chapa'], weekdays: ['seg','ter','qua','qui','sex','sab'], start: '08:00', end: '16:20', breakStart: '12:00', breakEnd: '13:00', pair: 2 },
  { key: 'cozinheiro2', name: 'Rafael Cozinheiro', email: 'cozinheiro2@homolog.local', role: 'cook', sector: 'cozinha', jobTitle: 'Cozinheiro', shift: 'noite', skills: ['chapa','preparo'], certifications: ['chapa'], weekdays: ['seg','ter','qua','qui','sex','dom'], start: '14:00', end: '22:20', breakStart: '18:00', breakEnd: '19:00', pair: 3 },
  { key: 'auxiliar1', name: 'Aline Auxiliar', email: 'auxiliar1@homolog.local', role: 'auxiliar', sector: 'cozinha', jobTitle: 'Auxiliar de cozinha', shift: 'manha', skills: ['preparo','limpeza'], certifications: ['montagem'], weekdays: ['seg','ter','qua','qui','sex'], start: '08:00', end: '16:20', pair: 4 },
  { key: 'auxiliar2', name: 'Bruno Auxiliar', email: 'auxiliar2@homolog.local', role: 'auxiliar', sector: 'cozinha', jobTitle: 'Auxiliar de cozinha', shift: 'noite', skills: ['preparo','limpeza'], certifications: [], weekdays: ['ter','qua','qui','sex','sab'], start: '14:00', end: '22:20', pair: 0 },
  { key: 'atendente1', name: 'Daniela Atendente', email: 'atendente1@homolog.local', role: 'auxiliar', sector: 'frente', jobTitle: 'Atendente', shift: 'manha', skills: ['atendimento'], certifications: [], weekdays: ['seg','ter','qua','qui','sex'], start: '08:00', end: '16:20', pair: 1 },
  { key: 'atendente2', name: 'Eduardo Atendente', email: 'atendente2@homolog.local', role: 'auxiliar', sector: 'apoio', jobTitle: 'Atendente', shift: 'noite', skills: ['atendimento','apoio'], certifications: [], weekdays: ['qua','qui','sex','sab','dom'], start: '14:00', end: '22:20', pair: 2 },
  { key: 'caixa', name: 'Fernanda Caixa', email: 'caixa@homolog.local', role: 'auxiliar', sector: 'caixa', jobTitle: 'Caixa', shift: 'intermediario', skills: ['caixa','atendimento'], certifications: [], weekdays: ['seg','ter','qua','qui','sex','sab'], start: '10:00', end: '18:20', breakStart: '14:00', breakEnd: '15:00', pair: 3 },
];

async function ensureUser(def) {
  const password = 'Homolog@12345';
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(def.email);
  } catch {
    userRecord = null;
  }
  if (!userRecord) {
    userRecord = await auth.createUser({ uid: `uid-${def.key}`, email: def.email, password, displayName: def.name, emailVerified: true });
  } else {
    await auth.updateUser(userRecord.uid, { password, displayName: def.name, emailVerified: true, disabled: false });
  }
  return { ...def, uid: userRecord.uid, password };
}

const users = [];
for (const def of staffDefs) users.push(await ensureUser(def));
const byKey = Object.fromEntries(users.map(u => [u.key, u]));
const now = new Date();

const unitRef = db.collection('units').doc(HOMOLOG_UNIT_ID);
const batch = db.batch();

// Unit
batch.set(unitRef, {
  name: 'Unidade Homologação',
  code: 'HOMOLOG',
  status: 'active',
  timezone: 'America/Sao_Paulo',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  homologation: true,
}, { merge: true });

// Memberships and staff registry
for (const u of users) {
  batch.set(db.collection('memberships').doc(u.uid), {
    uid: u.uid,
    unitId: HOMOLOG_UNIT_ID,
    role: u.role,
    status: 'active',
    name: u.name,
    email: u.email,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const staffRef = unitRef.collection('staffRegistry').doc(u.uid);
  batch.set(staffRef, {
    accountUid: u.uid,
    name: u.name,
    email: u.email,
    status: 'active',
    sector: u.sector,
    jobTitle: u.jobTitle,
    shift: u.shift,
    availability: availability(u.weekdays, u.start, u.end, u.breakStart, u.breakEnd),
    skills: u.skills,
    certifications: u.certifications,
    fixedWeekday: ['seg','ter','qua','qui','sex','sab','dom'].indexOf(u.weekdays[0] === 'seg' ? 'seg' : u.weekdays[0]),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// Coverage requirements/rates/policy
const weeks = fiveTwoWeeks(period);
const sundays = fiveTwoSundays(period);
const roster = { weekly: {}, sundays: {} };
for (const w of weeks) {
  roster.weekly[w] = {};
  for (const u of users) roster.weekly[w][u.uid] = u.pair % 5;
}
for (let i = 0; i < users.length; i++) {
  roster.sundays[users[i].uid] = sundays[i % sundays.length];
}
const peopleForEntries = users.map(u => ({ uid: u.uid, accountUid: u.uid, name: u.name, status: 'active', sector: u.sector, jobTitle: u.jobTitle, shift: u.shift }));
const entries = fiveTwoEntries({ period, members: peopleForEntries, roster, approvedLeaves: [], dates: undefined }).map(e => ({ ...e }));

await batch.commit();

const batch2 = db.batch();
batch2.set(unitRef.collection('configuration').doc('staffRegistry'), { active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
batch2.set(unitRef.collection('configuration').doc('coverageRequirements'), {
  requirements: [
    { weekday: 0, sector: 'cozinha', minimum: 4, skill: '', start: '12:00', end: '20:20' },
    { weekday: 0, sector: 'frente', minimum: 3, skill: '', start: '12:00', end: '20:20' },
    { weekday: 1, sector: 'cozinha', minimum: 2, skill: '', start: '14:00', end: '22:20' },
    { weekday: 5, sector: 'cozinha', minimum: 3, skill: '', start: '14:00', end: '22:20' },
  ],
  operationalPolicy: {
    holidays: [], peakPeriods: [{ start: `${period}-01`, end: `${period}-28` }], strongPeaks: [], frontWeekdayMinimum: 2,
    countManagement: true, managementPaid: null, recurring: [],
  },
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: byKey.gerente.uid,
}, { merge: true });
batch2.set(unitRef.collection('configuration').doc('coverageRates'), {
  rates: { manager: 150, submanager: 120, head_cook: 150, cook: 120, other: 100, external: 100 },
  payroll: { daysAfter: 5 },
  individualRates: { [byKey.auxiliar1.uid]: { amount: 110, daysAfter: 5 } },
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: byKey.gerente.uid,
}, { merge: true });

// Published schedule
const scheduleId = `schedule-${period}-published`;
const scheduleRef = unitRef.collection('schedules').doc(scheduleId);
const scheduleData = {
  title: `Escala ${period} (publicada)`,
  period,
  status: 'published',
  revision: 1,
  entries,
  roster,
  createdBy: byKey.gerente.uid,
  updatedBy: byKey.gerente.uid,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  publishedAt: FieldValue.serverTimestamp(),
  publishedBy: byKey.gerente.uid,
};
batch2.set(scheduleRef, scheduleData, { merge: true });
batch2.set(unitRef.collection('schedulePublicationState').doc(period), { activeId: scheduleId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

// Absence: approved leave for a future date in period
const futureDate = plusDays(today, 3);
const leaveId = `${byKey.atendente1.uid}_${futureDate}`;
batch2.set(unitRef.collection('leaveRequests').doc(leaveId), {
  uid: byKey.atendente1.uid,
  date: futureDate,
  reason: 'Ausência simulada para homologação (consulta médica).',
  status: 'approved',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  decidedBy: byKey.gerente.uid,
  decidedAt: FieldValue.serverTimestamp(),
  note: 'Ausência aprovada no cenário de homologação.',
});

// Coverage proposals for E2E flows
const inviteId = 'cov-invite-pending';
const inviteDate = plusDays(today, 2);
batch2.set(unitRef.collection('coverageProposals').doc(inviteId), {
  operational: true,
  planId: scheduleId,
  planRevision: 1,
  date: inviteDate,
  sector: 'cozinha',
  shift: 'noite',
  staffId: byKey.auxiliar1.uid,
  accountUid: byKey.auxiliar1.uid,
  name: byKey.auxiliar1.name,
  second: { start: '14:00', end: '22:20' },
  first: null,
  roleGap: false,
  skillGap: false,
  headcountGap: true,
  resolves: ['headcount'],
  fixedFeePolicy: { paid: true },
  practicePayment: 110,
  payrollSnapshot: { daysAfter: 5 },
  legalEstimate: null,
  legalValidated: false,
  reviewReasons: [],
  reason: 'Convite simulado para reforço de cozinha.',
  status: 'pending_acceptance',
  consentPending: false,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: byKey.gerente.uid,
  unitId: HOMOLOG_UNIT_ID,
});

// Approved proposal ready for completion (past or today-ish handling depends; use yesterday for completion eligibility)
const approvedCovId = 'cov-approved-complete';
const completedCovId = 'cov-completed-pay';
const yesterday = plusDays(today, -1);
const twoDaysAgo = plusDays(today, -2);
batch2.set(unitRef.collection('coverageProposals').doc(approvedCovId), {
  operational: true,
  planId: scheduleId,
  planRevision: 1,
  date: twoDaysAgo,
  sector: 'frente',
  shift: 'manha',
  staffId: byKey.atendente2.uid,
  accountUid: byKey.atendente2.uid,
  name: byKey.atendente2.name,
  second: { start: '08:00', end: '16:20' },
  first: null,
  roleGap: false,
  skillGap: false,
  headcountGap: true,
  resolves: ['headcount'],
  fixedFeePolicy: { paid: true },
  practicePayment: 100,
  payrollSnapshot: { daysAfter: 5 },
  rateRole: 'other',
  legalEstimate: null,
  legalValidated: false,
  reviewReasons: [],
  reason: 'Cobertura aprovada para conclusão no cenário de homologação.',
  status: 'approved',
  consentPending: false,
  acceptedAt: FieldValue.serverTimestamp(),
  decidedAt: FieldValue.serverTimestamp(),
  decidedBy: byKey.gerente.uid,
  decisionNote: 'Aprovação simulada para teste de conclusão.',
  legalReviewConfirmed: true,
  consentVerified: true,
  consentEvidence: 'Aceite registrado no cenário de homologação.',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: byKey.gerente.uid,
  unitId: HOMOLOG_UNIT_ID,
});

// Completed proposal ready for payment
batch2.set(unitRef.collection('coverageProposals').doc(completedCovId), {
  operational: true,
  planId: scheduleId,
  planRevision: 1,
  date: plusDays(today, -3),
  sector: 'caixa',
  shift: 'intermediario',
  staffId: byKey.caixa.uid,
  accountUid: byKey.caixa.uid,
  name: byKey.caixa.name,
  second: { start: '10:00', end: '18:20' },
  first: null,
  roleGap: false,
  skillGap: false,
  headcountGap: true,
  resolves: ['headcount'],
  fixedFeePolicy: { paid: true },
  practicePayment: 100,
  payrollSnapshot: { daysAfter: 5 },
  fee: { amount: 100, dueDate: today, rateRole: 'other', policy: { daysAfter: 5 } },
  legalEstimate: null,
  legalValidated: false,
  reviewReasons: [],
  reason: 'Cobertura concluída para pagamento no cenário de homologação.',
  status: 'completed',
  consentPending: false,
  acceptedAt: FieldValue.serverTimestamp(),
  decidedAt: FieldValue.serverTimestamp(),
  decidedBy: byKey.gerente.uid,
  decisionNote: 'Aprovação e conclusão simuladas.',
  legalReviewConfirmed: true,
  consentVerified: true,
  consentEvidence: 'Aceite registrado no cenário de homologação.',
  completedAt: FieldValue.serverTimestamp(),
  completedBy: byKey.gerente.uid,
  actualStart: '10:00',
  actualEnd: '18:20',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: byKey.gerente.uid,
  unitId: HOMOLOG_UNIT_ID,
});

// Mural notice
batch2.set(unitRef.collection('muralItems').doc('notice-homolog'), {
  kind: 'notice',
  title: 'Comunicado de homologação',
  body: 'Ambiente local de homologação ativo com dados simulados.',
  priority: 'normal',
  ingredients: [],
  yieldText: '',
  allergens: [],
  status: 'published',
  version: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  publishedAt: FieldValue.serverTimestamp(),
  publishedBy: byKey.gerente.uid,
  publishedByName: byKey.gerente.name,
  createdBy: byKey.gerente.uid,
  updatedBy: byKey.gerente.uid,
  unitId: HOMOLOG_UNIT_ID,
});

// Notifications for a user
batch2.set(unitRef.collection('memberNotifications').doc(byKey.auxiliar1.uid).collection('items').doc('notif-invite'), {
  title: 'Convite de cobertura',
  message: `Você recebeu um convite de cobertura para ${inviteDate}.`,
  read: false,
  at: FieldValue.serverTimestamp(),
  source: 'Cobertura',
  page: 'coverage',
  coverage: { proposalId: inviteId, date: inviteDate, shift: 'noite', sector: 'cozinha' },
});

// Basic operational data: product, stock/balance, purchase order, receiving, production
const productId = 'prod-carne-homolog';
batch2.set(unitRef.collection('products').doc(productId), {
  name: 'Carne bovina (homologação)',
  unit: 'kg',
  status: 'active',
  category: 'proteina',
  trackExpiry: false,
  minStock: 5,
  countFrequency: 'daily',
  critical: true,
  active: true,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch2.set(unitRef.collection('physicalBalances').doc(productId), {
  productId,
  productName: 'Carne bovina (homologação)',
  unit: 'kg',
  reserve: 8,
  rotation: 4,
  total: 12,
  updatedAt: FieldValue.serverTimestamp(),
  quality: 'ESTIMATED_BY_MOVEMENTS',
});

const orderId = randomUUID();
batch2.set(unitRef.collection('purchaseOrdersV3').doc(orderId), {
  supplier: 'Fornecedor Homologação',
  status: 'expected',
  items: [{ productId, quantity: 10, unit: 'kg', name: 'Carne bovina (homologação)' }],
  etaDate: plusDays(today, 1),
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: byKey.gerente.uid,
});

// Simple receiving/shipment record for visibility (pending)
const receiptId = randomUUID();
batch2.set(unitRef.collection('receiptShipments').doc(receiptId), {
  orderId,
  lines: [{ productId, productName: 'Carne bovina (homologação)', commercialQuantity: 10, commercialUnit: 'kg', stockQuantity: 10, location: 'reserva', lot: '', expiryDate: '', stockUnit: 'kg' }],
  supplier: 'Fornecedor Homologação',
  notes: 'Recebimento simulado para homologação.',
  status: 'pending',
  createdAt: FieldValue.serverTimestamp(),
  createdBy: byKey.gerente.uid,
  unitId: HOMOLOG_UNIT_ID,
});

// Production run
const recipeId = randomUUID();
batch2.set(unitRef.collection('productionRecipes').doc(recipeId), {
  name: 'Preparação de carne (homologação)',
  active: true,
  version: 1,
  outputProductId: productId,
  outputUnit: 'kg',
  stockEffect: 'transformation',
  lines: [],
  preparationConfig: { label: 'Preparação de carne' },
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch2.set(unitRef.collection('productionRuns').doc(randomUUID()), {
  recipeId,
  recipeName: 'Preparação de carne (homologação)',
  recipeVersion: 1,
  portions: 5,
  outputUnit: 'kg',
  actorUid: byKey.cozinheiro1.uid,
  actorName: byKey.cozinheiro1.name,
  unitId: HOMOLOG_UNIT_ID,
  at: FieldValue.serverTimestamp(),
  kind: 'production',
  stockEffect: 'transformation',
});

await batch2.commit();

const credentials = users.map(u => ({ key: u.key, name: u.name, email: u.email, password: u.password, role: u.role, sector: u.sector, uid: u.uid }));
console.log(JSON.stringify({
  ok: true,
  projectId: HOMOLOG_PROJECT_ID,
  unitId: HOMOLOG_UNIT_ID,
  period,
  nextPeriod,
  scheduleId,
  leaveId,
  inviteId,
  approvedCovId,
  completedCovId,
  receiptId,
  orderId,
  credentials,
}, null, 2));
