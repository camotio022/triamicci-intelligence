/**
 * Importa o catálogo inicial para productCatalog/{id}.
 * Padrão: pré-visualização sem escrita. Para gravar: --apply.
 * Autentique com GOOGLE_APPLICATION_CREDENTIALS ou Application Default Credentials.
 * Não altera units/{unitId}/products, saldos, movimentos ou lotes.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const checkAccess = process.argv.includes('--check-access');
if (apply && checkAccess) throw new Error('Escolha apenas --apply ou --check-access.');
const file = new URL('../data/triamicci-product-catalog.json', import.meta.url);
const { products, schemaVersion } = JSON.parse(readFileSync(file, 'utf8'));
const ids = new Set(products.map(product => product.id));
if (ids.size !== products.length) throw new Error('IDs duplicados no catálogo');
for (const product of products) {
  if (!/^[a-z0-9-]+$/.test(product.id)) throw new Error('ID inválido: ' + product.id);
  if (!['kg', 'L', 'un'].includes(product.stockUnit)) throw new Error('Unidade inválida: ' + product.id);
  if ((product.producedFrom || []).some(id => !ids.has(id))) throw new Error('Origem não cadastrada: ' + product.id);
}
console.log(`${products.length} produtos definidos. Modo: ${apply ? 'GRAVAÇÃO' : checkAccess ? 'TESTE DE ACESSO (SEM ESCRITA)' : 'SIMULAÇÃO'}.`);
if (!apply && !checkAccess) {
  console.log('Nenhuma escrita executada. Use --apply com credenciais e projeto corretos.');
} else {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const confirmedId = process.env.CONFIRM_FIREBASE_PROJECT;
  if (!projectId || confirmedId !== projectId) {
    throw new Error('Defina GOOGLE_CLOUD_PROJECT e CONFIRM_FIREBASE_PROJECT com o mesmo ID do projeto Firebase de destino.');
  }
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  if (checkAccess) {
    try {
      const doc = await db.collection('productCatalog').doc('peito-frango').get();
      console.log('Acesso de leitura ao Firestore confirmado. Produto existe:', doc.exists);
    } catch (e) {
      console.error('Falha ao ler o Firestore. Código:', e.code, 'Mensagem:', e.message);
      throw e;
    }
    process.exit(0);
  }
  let created = 0, existing = 0;
  for (const product of products) {
    const ref = db.collection('productCatalog').doc(product.id);
    try {
      await ref.create({
        ...product, brandId: 'triamicci', schemaVersion,
        active: false, // Ativação só após revisão operacional; não habilita movimentações.
        createdAt: FieldValue.serverTimestamp()
      });
      created++;
    } catch (e) {
      if (e.code === 6 || e.code === 'already-exists') existing++;
      else throw e;
    }
  }
  console.log(`Criados: ${created}; já existentes (preservados): ${existing}.`);
}
