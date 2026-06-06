import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseFile(filePath) {
  const raw   = readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`No frontmatter in ${filePath}`);
  const data = yaml.load(match[1]);
  const body = match[2].trim();
  return { data, body };
}

function mapBakery({ data, body }) {
  return {
    slug:        data.slug,
    name:        data.name,
    suburb:      data.suburb      ?? null,
    address:     data.address     ?? null,
    category:    data.category    ?? null,
    hours:       data.hours       ?? null,
    website:     data.website     ?? null,
    instagram:   data.instagram   ?? null,
    thumbnail:   data.thumbnail   ?? null,
    lat:         data.lat         ?? null,
    lng:         data.lng         ?? null,
    description: data.description ?? null,
    video_id:    data.videoId     ?? null,
    map_link:    data.mapLink     ?? null,
    quote:       data.quote       ?? null,
    date:        data.date        ?? null,
    director:    data.director    ?? null,
    camera:      data.camera      ?? null,
    sound:       data.sound       ?? null,
    edit:        data.edit        ?? null,
    images:      data.images      ?? null,
    locations:   data.locations   ?? null,
    body:        body             || null,
    published:   true,
    updated_at:  new Date().toISOString(),
  };
}

function mapArticle({ data, body }) {
  return {
    slug:        data.slug,
    title:       data.name,
    category:    data.category    ?? null,
    description: data.description ?? null,
    content:     body,
    thumbnail:   data.thumbnail   ?? null,
    video_id:    data.videoId     ?? null,
    suburb:      data.suburb      ?? null,
    duration:    data.duration    ?? null,
    quote:       data.quote       ?? null,
    date:        data.date        ?? null,
    director:    data.director    ?? null,
    camera:      data.camera      ?? null,
    sound:       data.sound       ?? null,
    edit:        data.edit        ?? null,
    images:      data.images      ?? null,
    published:   true,
    updated_at:  new Date().toISOString(),
  };
}

async function upsert(table, rows, label) {
  console.log(`\n── ${label} ──`);
  for (const row of rows) {
    const { error } = await supabase
      .from(table)
      .upsert(row, { onConflict: 'slug' });
    if (error) {
      console.error(`  ✗  ${row.slug}:`, error.message, error.details ?? '');
    } else {
      console.log(`  ✓  ${row.slug}`);
    }
  }
}

async function diagnose() {
  console.log('\n── Diagnosing table access ──');
  const { data: bd, error: be } = await supabase.from('bakeries_cms').select('id').limit(1);
  console.log('bakeries_cms SELECT:', be ? `✗ ${be.message}` : `✓ (${bd?.length ?? 0} rows)`);
  const { data: ad, error: ae } = await supabase.from('articles_cms').select('id').limit(1);
  console.log('articles_cms SELECT:', ae ? `✗ ${ae.message}` : `✓ (${ad?.length ?? 0} rows)`);
}

async function run() {
  await diagnose();

  const bakeryDir   = join(root, 'src/content/bakeries');
  const bakeryFiles = readdirSync(bakeryDir).filter(f => f.endsWith('.md'));
  const bakeryRows  = bakeryFiles.map(f => mapBakery(parseFile(join(bakeryDir, f))));
  await upsert('bakeries_cms', bakeryRows, 'Bakeries → bakeries_cms');

  const articleDir   = join(root, 'src/content/kneed-to-know');
  const articleFiles = readdirSync(articleDir).filter(f => f.endsWith('.md'));
  const articleRows  = articleFiles.map(f => mapArticle(parseFile(join(articleDir, f))));
  await upsert('articles_cms', articleRows, 'Articles → articles_cms');

  console.log('\nMigration complete.\n');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
