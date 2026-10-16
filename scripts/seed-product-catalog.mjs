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
const file = new URL('../data/triamicci-product-catalog.json', import.meta.url);
const { products, schemaVersion } = JSON.parse(readFileSync(file, 'utf8'));
const ids = new Set(products.map(product => product.id));
if (ids.size !== products.length) throw new Error('IDs duplicados no catálogo');
for (const product of products) {
  if (!/^[a-z0-9-]+$/.test(product.id)) throw new Error('ID inválido: ' + product.id);
  if (!['kg', 'L', 'un'].includes(product.stockUnit)) throw new Error('Unidade inválida: ' + product.id);
  if ((product.producedFrom || []).some(id => !ids.has(id))) throw new Error('Origem não cadastrada: ' + product.id);
}
console.log(`${products.length} produtos definidos. Modo: ${apply ? 'GRAVAÇÃO' : 'SIMULAÇÃO'}.`);
if (!apply) {
  console.log('Nenhuma escrita executada. Use --apply com credenciais e projeto corretos.');
} else {
  if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GCLOUD_PROJECT && !process.env.FIREBASE_CONFIG) {
    throw new Error('Defina GOOGLE_CLOUD_PROJECT para evitar escrita no projeto errado.');
  }
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
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
