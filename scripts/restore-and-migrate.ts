import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function execRaw(sql: string) {
  await prisma.$executeRawUnsafe(sql);
}

function extractInsertStatements(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const statements: string[] = [];
  
  // Match INSERT INTO ... VALUES ... ; (handles multi-line)
  const regex = /INSERT\s+INTO\s+`?\w+`?\s+\([^)]+\)\s+VALUES\s+[\s\S]*?;/gi;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    statements.push(match[0].trim());
  }
  
  return statements;
}

async function main() {
  console.log('🔄 Starting database restoration and branch migration...\n');

  // Step 1: Disable foreign key checks
  console.log('1️⃣  Disabling foreign key checks...');
  await execRaw('SET FOREIGN_KEY_CHECKS = 0');

  // Step 2: Truncate existing data
  console.log('2️⃣  Truncating existing area and service_area data...');
  await execRaw('TRUNCATE TABLE service_area');
  await execRaw('TRUNCATE TABLE area');

  // Step 3: Import area.sql
  console.log('3️⃣  Importing area.sql...');
  const areaInserts = extractInsertStatements(join(__dirname, '../area.sql'));
  console.log(`   Found ${areaInserts.length} INSERT statements`);
  
  for (const stmt of areaInserts) {
    try {
      await execRaw(stmt);
    } catch (e: any) {
      console.error('   Error executing area INSERT:', e.message?.substring(0, 150));
    }
  }

  const areaCount = await prisma.area.count();
  console.log(`   ✅ Imported ${areaCount} area records`);

  // Step 4: Import service_area.sql
  console.log('4️⃣  Importing service_area.sql...');
  const saInserts = extractInsertStatements(join(__dirname, '../service_area.sql'));
  console.log(`   Found ${saInserts.length} INSERT statements`);
  
  for (const stmt of saInserts) {
    try {
      await execRaw(stmt);
    } catch (e: any) {
      console.error('   Error executing service_area INSERT:', e.message?.substring(0, 150));
    }
  }

  const saCount = await prisma.service_area.count();
  console.log(`   ✅ Imported ${saCount} service_area records`);

  // Step 5: Add branch_id column to area if not exists
  console.log('5️⃣  Adding branch_id column to area table...');
  try {
    await execRaw('ALTER TABLE area ADD COLUMN branch_id INT NULL AFTER nama_area');
    console.log('   ✅ branch_id column added');
  } catch (e: any) {
    if (e.message?.includes('Duplicate column')) {
      console.log('   ℹ️  branch_id column already exists');
    } else {
      throw e;
    }
  }

  // Step 6: Run branch mapping
  console.log('6️⃣  Populating branch hierarchy...\n');

  const DATA = [
    { sa: 'TOP', area: 'DHARMASABA UBUNG', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'UBN', area: 'DHARMASABA UBUNG', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'GIN', area: 'GIANYAR', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'BLI', area: 'GIANYAR', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'KNT', area: 'GIANYAR', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'NGR', area: 'JEMBRANA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'GMK', area: 'JEMBRANA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'JBR', area: 'JIMBARAN', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'KLM', area: 'KALIASEM', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'NSD', area: 'KUTA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'KUT', area: 'KUTA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'MMN', area: 'MONANG MANING', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'SMY', area: 'MONANG MANING', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'BNO', area: 'SANUR', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'SAU', area: 'SANUR', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'APR', area: 'SEMARAPURA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'SMA', area: 'SEMARAPURA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'CDS', area: 'SEMARAPURA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'LVN', area: 'SINGARAJA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'SGR', area: 'SINGARAJA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'SRR', area: 'SINGARAJA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'PUA', area: 'SINGARAJA', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'BTR', area: 'TABANAN', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'TBN', area: 'TABANAN', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'SWI', area: 'UBUD', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'UBU', area: 'UBUD', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'TPS', area: 'UBUD', branch: 'DENPASAR', region: 'BALI NUSRA' },
    { sa: 'WWR', area: 'ENDE', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'BJW', area: 'LABUAN BAJO', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'LBO', area: 'LABUAN BAJO', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'RTE', area: 'LABUAN BAJO', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'REO', area: 'LABUAN BAJO', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'LWB', area: 'MAUMERE', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'MMR', area: 'MAUMERE', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'LRT', area: 'MAUMERE', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'END', area: 'MAUMERE', branch: 'FLORES', region: 'BALI NUSRA' },
    { sa: 'BWG', area: 'BANYUWANGI', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'KET', area: 'BANYUWANGI', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'WSO', area: 'BANYUWANGI', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'BOW', area: 'BONDOWOSO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'PRJ', area: 'BONDOWOSO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'SKS', area: 'BONDOWOSO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'BCK', area: 'GENTENG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'GEN', area: 'GENTENG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'GLM', area: 'GENTENG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'KBR', area: 'GENTENG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'MCR', area: 'GENTENG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'PSG', area: 'GENTENG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'RGJ', area: 'GENTENG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'AJS', area: 'JEMBER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'JER', area: 'JEMBER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'KLT', area: 'JEMBER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'SKW', area: 'JEMBER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'SPO', area: 'JEMBER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'KBS', area: 'KEBONSARI', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'JTO', area: 'LUMAJANG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'KKH', area: 'LUMAJANG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'LMJ', area: 'LUMAJANG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'PII', area: 'LUMAJANG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'SDO', area: 'LUMAJANG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'TPH', area: 'LUMAJANG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'YSN', area: 'LUMAJANG', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'GND', area: 'PROBOLINGGO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'KRZ', area: 'PROBOLINGGO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'LCE', area: 'PROBOLINGGO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'PBL', area: 'PROBOLINGGO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'PTN', area: 'PROBOLINGGO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'SKP', area: 'PROBOLINGGO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'TGS', area: 'PROBOLINGGO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'ABL', area: 'PUGER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'BUG', area: 'PUGER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'JGW', area: 'PUGER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'KNO', area: 'PUGER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'PUG', area: 'PUGER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'RBP', area: 'PUGER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'TGU', area: 'PUGER', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'ASB', area: 'SITUBONDO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'BKI', area: 'SITUBONDO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'MLD', area: 'SITUBONDO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'SIT', area: 'SITUBONDO', branch: 'JEMBER', region: 'JATIM' },
    { sa: 'KEF', area: 'ATAMBUA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'ATB', area: 'ATAMBUA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'BEN', area: 'ATAMBUA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'KLH', area: 'ATAMBUA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'SOE', area: 'ATAMBUA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'NKN', area: 'ATAMBUA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'OSP', area: 'KUPANG', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'KPN', area: 'KUPANG', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'TNA', area: 'KUPANG', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'WGP', area: 'SUMBA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'BAA', area: 'SUMBA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'WKB', area: 'SUMBA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'SEB', area: 'SUMBA', branch: 'KUPANG', region: 'BALI NUSRA' },
    { sa: 'BBE', area: 'BAMBE', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'BCR', area: 'BANCAR', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'JTR', area: 'BANCAR', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'KRK', area: 'BANCAR', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'MRR', area: 'BANCAR', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'BJN', area: 'BOJONEGORO', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'KDU', area: 'BOJONEGORO', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'PAD', area: 'BOJONEGORO', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'SMJ', area: 'BOJONEGORO', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'BPG', area: 'CERME', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'BWN', area: 'CERME', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'CRM', area: 'CERME', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'DDS', area: 'CERME', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'KDE', area: 'CERME', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'SDY', area: 'CERME', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'GSK', area: 'GRESIK', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'POG', area: 'GRESIK', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'BBA', area: 'LAMONGAN', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'BDG', area: 'LAMONGAN', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'LMG', area: 'LAMONGAN', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'SDD', area: 'LAMONGAN', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'RGL', area: 'TUBAN', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'TNZ', area: 'TUBAN', branch: 'LAMONGAN', region: 'JATIM' },
    { sa: 'KDI', area: 'KEDIRI', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'MJT', area: 'KEDIRI', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'NDL', area: 'KEDIRI', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'SBI', area: 'KEDIRI', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'CRB', area: 'MADIUN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'MNZ', area: 'MADIUN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'MSP', area: 'MADIUN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'UTR', area: 'MADIUN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'GGR', area: 'MAGETAN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'JGO', area: 'MAGETAN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'KRJ', area: 'MAGETAN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'MGT', area: 'MAGETAN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'NWI', area: 'MAGETAN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'SAR', area: 'MAGETAN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'WKU', area: 'MAGETAN', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'GON', area: 'NGANJUK', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'KTS', area: 'NGANJUK', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'NJK', area: 'NGANJUK', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'PRB', area: 'NGANJUK', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'WRJ', area: 'NGANJUK', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'GUR', area: 'PARE', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'KAA', area: 'PARE', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'PAE', area: 'PARE', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'PPR', area: 'PARE', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'WAT', area: 'PARE', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'JEN', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'LOG', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'PLG', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'PNG', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'PNZ', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'PON', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'SAT', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'SLH', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'SMO', area: 'PONOROGO', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'DRN', area: 'TRENGGALEK', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'PRI', area: 'TRENGGALEK', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'TRE', area: 'TRENGGALEK', branch: 'MADIUN', region: 'JATIM' },
    { sa: 'GOM', area: 'KEBUMEN', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'KAK', area: 'KEBUMEN', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'KBM', area: 'KEBUMEN', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'KTW', area: 'KEBUMEN', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'MGE', area: 'MAGELANG', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'MTY', area: 'MAGELANG', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'KTA', area: 'PURWOREJO', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'MNK', area: 'PURWOREJO', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'MUN', area: 'PURWOREJO', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'PWJ', area: 'PURWOREJO', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'SWT', area: 'PURWOREJO', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'PRN', area: 'TEMANGGUNG', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'TEM', area: 'TEMANGGUNG', branch: 'MAGELANG', region: 'JATENG DIY' },
    { sa: 'BTU', area: 'BATU', branch: 'MALANG', region: 'JATIM' },
    { sa: 'KPO', area: 'BATU', branch: 'MALANG', region: 'JATIM' },
    { sa: 'NTG', area: 'BATU', branch: 'MALANG', region: 'JATIM' },
    { sa: 'BLB', area: 'BLIMBING', branch: 'MALANG', region: 'JATIM' },
    { sa: 'BLR', area: 'BLITAR', branch: 'MALANG', region: 'JATIM' },
    { sa: 'BNU', area: 'BLITAR', branch: 'MALANG', region: 'JATIM' },
    { sa: 'KBN', area: 'BLITAR', branch: 'MALANG', region: 'JATIM' },
    { sa: 'LDY', area: 'BLITAR', branch: 'MALANG', region: 'JATIM' },
    { sa: 'PAN', area: 'BLITAR', branch: 'MALANG', region: 'JATIM' },
    { sa: 'SNT', area: 'BLITAR', branch: 'MALANG', region: 'JATIM' },
    { sa: 'WGI', area: 'BLITAR', branch: 'MALANG', region: 'JATIM' },
    { sa: 'DNO', area: 'KEPANJEN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'GDG', area: 'KEPANJEN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'GKW', area: 'KEPANJEN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'KEP', area: 'KEPANJEN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'PGK', area: 'KEPANJEN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'SBP', area: 'KEPANJEN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'KLJ', area: 'KLOJEN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'BRG', area: 'MALANG', branch: 'MALANG', region: 'JATIM' },
    { sa: 'MLG', area: 'MALANG', branch: 'MALANG', region: 'JATIM' },
    { sa: 'SWJ', area: 'MALANG', branch: 'MALANG', region: 'JATIM' },
    { sa: 'LWG', area: 'SINGOSARI', branch: 'MALANG', region: 'JATIM' },
    { sa: 'PKS', area: 'SINGOSARI', branch: 'MALANG', region: 'JATIM' },
    { sa: 'SGS', area: 'SINGOSARI', branch: 'MALANG', region: 'JATIM' },
    { sa: 'TMP', area: 'SINGOSARI', branch: 'MALANG', region: 'JATIM' },
    { sa: 'CAT', area: 'TULUNGAGUNG', branch: 'MALANG', region: 'JATIM' },
    { sa: 'KWR', area: 'TULUNGAGUNG', branch: 'MALANG', region: 'JATIM' },
    { sa: 'NGU', area: 'TULUNGAGUNG', branch: 'MALANG', region: 'JATIM' },
    { sa: 'TUL', area: 'TULUNGAGUNG', branch: 'MALANG', region: 'JATIM' },
    { sa: 'APG', area: 'TUREN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'BNR', area: 'TUREN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'DPT', area: 'TUREN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'GDI', area: 'TUREN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'SBM', area: 'TUREN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'TUR', area: 'TUREN', branch: 'MALANG', region: 'JATIM' },
    { sa: 'DMP', area: 'BIMA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'SIL', area: 'BIMA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'BIM', area: 'BIMA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'KMP', area: 'BIMA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'TET', area: 'BIMA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'SAP', area: 'BIMA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'MTR', area: 'MATARAM', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'SGG', area: 'MATARAM', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'MBG', area: 'SELONG', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'SEL', area: 'SELONG', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'SBW', area: 'SUMBAWA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'MLK', area: 'SUMBAWA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'TLW', area: 'SUMBAWA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'ALA', area: 'SUMBAWA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'EMP', area: 'SUMBAWA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'PRY', area: 'SWETA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'SWE', area: 'SWETA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'GER', area: 'SWETA', branch: 'MATARAM', region: 'BALI NUSRA' },
    { sa: 'BKA', area: 'BREBES', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'BMU', area: 'BREBES', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'BRB', area: 'BREBES', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'KTM', area: 'BREBES', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'TTL', area: 'BREBES', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'BDY', area: 'PEKALONGAN', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'BTG', area: 'PEKALONGAN', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'PKL', area: 'PEKALONGAN', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'SBA', area: 'PEKALONGAN', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'CMA', area: 'PEMALANG', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'KDW', area: 'PEMALANG', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'KJE', area: 'PEMALANG', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'PML', area: 'PEMALANG', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'RDD', area: 'PEMALANG', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'BBT', area: 'PURBALINGGA', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'PBG', area: 'PURBALINGGA', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'ADW', area: 'TEGAL', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'BLU', area: 'TEGAL', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'MGN', area: 'TEGAL', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'SLW', area: 'TEGAL', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'TEG', area: 'TEGAL', branch: 'PEKALONGAN', region: 'JATENG DIY' },
    { sa: 'BJR', area: 'BANJARNEGARA', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'KLP', area: 'BANJARNEGARA', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'MAN', area: 'CILACAP', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'CLC', area: 'CILACAP', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'GML', area: 'CILACAP', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'SDJ', area: 'CILACAP', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'AJB', area: 'PURWOKERTO', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'CLO', area: 'PURWOKERTO', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'BRD', area: 'PURWOKERTO', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'PWT', area: 'PURWOKERTO', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'KRY', area: 'SUKARAJA', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'MAO', area: 'SUKARAJA', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'BYM', area: 'SUKARAJA', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'SUK', area: 'SUKARAJA', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'WOS', area: 'WONOSOBO', branch: 'PURWOKERTO', region: 'JATENG DIY' },
    { sa: 'BMK', area: 'BANYUMANIK', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'SMC', area: 'BANYUMANIK', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'SSL', area: 'BANYUMANIK', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'BOJ', area: 'BOJA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'MJE', area: 'BOJA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'MKG', area: 'BOJA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'BAN', area: 'JEPARA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'JPR', area: 'JEPARA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'KEL', area: 'JEPARA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'KMJ', area: 'JEPARA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'PEC', area: 'JEPARA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'GNK', area: 'JOHAR', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'JHR', area: 'JOHAR', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'KDL', area: 'KENDAL', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'SKR', area: 'KENDAL', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'WLR', area: 'KENDAL', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'DMA', area: 'KUDUS', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'KUD', area: 'KUDUS', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'MJP', area: 'MAJAPAHIT', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'JWN', area: 'PATI', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'PAT', area: 'PATI', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'TAY', area: 'PATI', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'LSE', area: 'REMBANG', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'RBN', area: 'REMBANG', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'SLI', area: 'SALATIGA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'SUH', area: 'SALATIGA', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'SMT', area: 'TUGU', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'ABR', area: 'UNGARAN', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'BDN', area: 'UNGARAN', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'BWE', area: 'UNGARAN', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'UNR', area: 'UNGARAN', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'WNJ', area: 'UNGARAN', branch: 'SEMARANG', region: 'JATENG DIY' },
    { sa: 'GDA', area: 'GEDANGAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'JOM', area: 'JOMBANG', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'MOJ', area: 'JOMBANG', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'NRJ', area: 'JOMBANG', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'POS', area: 'JOMBANG', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'DLA', area: 'MOJOKERTO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'MIP', area: 'MOJOKERTO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'MJS', area: 'MOJOKERTO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'MRT', area: 'MOJOKERTO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'NGI', area: 'MOJOKERTO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'PCT', area: 'MOJOKERTO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'BEJ', area: 'PANDAAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'GEM', area: 'PANDAAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'PDA', area: 'PANDAAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'PGE', area: 'PANDAAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'PWS', area: 'PANDAAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'BNL', area: 'PASURUAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'GDW', area: 'PASURUAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'GRA', area: 'PASURUAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'NJA', area: 'PASURUAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'PSN', area: 'PASURUAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'TOS', area: 'PASURUAN', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'SPJ', area: 'SEPANJANG', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'SDA', area: 'SIDOARJO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'KRN', area: 'SUKODONO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'SDN', area: 'SUKODONO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'TUN', area: 'SUKODONO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'TPO', area: 'TROPODO', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'WRU', area: 'WARU', branch: 'SIDOARJO', region: 'JATIM' },
    { sa: 'DMO', area: 'DARMO', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'GBG', area: 'GUBENG', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'IJK', area: 'INJOKO', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'JGR', area: 'JAGIR', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'MYR', area: 'MANYAR', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'RKT', area: 'RUNGKUT', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'KPS', area: 'KAPASAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'KBL', area: 'KEBALEN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'PRK', area: 'KEBALEN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'KJR', area: 'KENJERAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'MGO', area: 'MERGOYOSO', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'KLN', area: 'KALIANAK', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'TNS', area: 'TANDES', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'KNN', area: 'KANDANGAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'LKI', area: 'LAKARSANTRI', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'KRP', area: 'KARANGPILANG', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'BKL', area: 'BANGKALAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'KML', area: 'BANGKALAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'ARB', area: 'BANGKALAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'TBU', area: 'BANGKALAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'BEA', area: 'BANGKALAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'SPG', area: 'SAMPANG', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'KPP', area: 'SAMPANG', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'OMB', area: 'SAMPANG', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'PME', area: 'PAMEKASAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'WRP', area: 'PAMEKASAN', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'PRG', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'SMP', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'BAB', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'ABU', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'SPD', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'AJA', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'SPK', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'MSL', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'ABT', area: 'SUMENEP', branch: 'SURABAYA', region: 'JATIM' },
    { sa: 'BLO', area: 'BLORA', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'CEP', area: 'BLORA', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'NGA', area: 'BLORA', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'RDB', area: 'BLORA', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'BYL', area: 'BOYOLALI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'KTO', area: 'BOYOLALI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'GLD', area: 'GLADAG', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'SLO', area: 'GLADAG', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'KAR', area: 'KARANGANYAR', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'TWM', area: 'KARANGANYAR', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'KRT', area: 'KERTEN', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'DLG', area: 'KLATEN', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'KLX', area: 'KLATEN', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'PEN', area: 'KLATEN', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'BKG', area: 'PALUR', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'MSO', area: 'PALUR', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'SOP', area: 'PALUR', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'GBU', area: 'PURWODADI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'GDO', area: 'PURWODADI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'PWB', area: 'PURWODADI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'TRO', area: 'PURWODADI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'WRO', area: 'PURWODADI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'SRG', area: 'SRAGEN', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'BRN', area: 'WONOGIRI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'JSO', area: 'WONOGIRI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'SKH', area: 'WONOGIRI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'TWS', area: 'WONOGIRI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'WNG', area: 'WONOGIRI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'PWO', area: 'WONOGIRI', branch: 'SURAKARTA', region: 'JATENG DIY' },
    { sa: 'BTL', area: 'BANTUL', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'WTS', area: 'BANTUL', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'KEN', area: 'KENTUNGAN', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'BBS', area: 'KENTUNGAN', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'KBU', area: 'KOTABARU', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'WNS', area: 'KOTAGEDE', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'KGD', area: 'KOTAGEDE', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'BPN', area: 'KOTAGEDE', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'PKM', area: 'PAKEM', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'KLS', area: 'PAKEM', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'SMN', area: 'SLEMAN', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'GOD', area: 'SLEMAN', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
    { sa: 'PGR', area: 'YOGYAKARTA', branch: 'YOGYAKARTA', region: 'JATENG DIY' },
  ];

  // Build region map
  const regions = [...new Set(DATA.map(d => d.region))];
  const regionMap: Record<string, number> = {};

  for (const regionName of regions) {
    const existing = await prisma.region.findUnique({ where: { nama_region: regionName } });
    if (existing) {
      regionMap[regionName] = existing.id_region;
    } else {
      const created = await prisma.region.create({ data: { nama_region: regionName } });
      regionMap[regionName] = created.id_region;
    }
  }

  // Build branch map
  const branchKeys = [...new Set(DATA.map(d => `${d.region}||${d.branch}`))];
  const branchMap: Record<string, number> = {};
  const branchCodeCounter: Record<string, number> = {};

  for (const branchKey of branchKeys) {
    const [regionName, branchName] = branchKey.split('||');
    const regionId = regionMap[regionName];

    const existing = await prisma.branch.findFirst({
      where: { nama_branch: branchName, region_id: regionId },
    });
    if (existing) {
      branchMap[branchKey] = existing.id_branch;
    } else {
      const baseCode = branchName.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
      const counter = (branchCodeCounter[baseCode] || 0) + 1;
      branchCodeCounter[baseCode] = counter;
      const kode = counter === 1 ? baseCode : `${baseCode}${counter}`;

      const created = await prisma.branch.create({
        data: { nama_branch: branchName, kode_branch: kode, region_id: regionId },
      });
      branchMap[branchKey] = created.id_branch;
    }
  }

  // Build area name -> branch_id map
  const areaNameToBranchId: Record<string, number> = {};
  for (const item of DATA) {
    const branchKey = `${item.region}||${item.branch}`;
    const branchId = branchMap[branchKey];
    areaNameToBranchId[item.area.trim().toUpperCase()] = branchId;
  }

  // Update area.branch_id
  console.log('   Updating area.branch_id...');
  const allAreas = await prisma.area.findMany();
  let updatedAreas = 0;
  
  for (const area of allAreas) {
    const normalizedNama = area.nama_area.trim().toUpperCase();
    let branchId = areaNameToBranchId[normalizedNama];

    // Handle special case: "DHARMASABA+SA UBUNG" should match "DHARMASABA UBUNG"
    if (!branchId) {
      const cleaned = normalizedNama.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
      branchId = areaNameToBranchId[cleaned];
    }

    if (branchId) {
      await prisma.area.update({
        where: { id_area: area.id_area },
        data: { branch_id: branchId },
      });
      updatedAreas++;
    }
  }

  console.log(`   ✅ Updated ${updatedAreas}/${allAreas.length} areas with branch_id`);

  // Update service_area.area_id based on nama_sa -> area mapping
  console.log('7️⃣  Linking service_area to correct area_id...');
  const allServiceAreas = await prisma.service_area.findMany();
  let updatedSAs = 0;

  // Build sa -> area_id lookup
  const saToAreaId: Record<string, number> = {};
  for (const item of DATA) {
    const areaName = item.area.trim().toUpperCase();
    const matchingArea = allAreas.find(a => 
      a.nama_area.trim().toUpperCase() === areaName ||
      a.nama_area.trim().toUpperCase().replace(/\+/g, ' ') === areaName
    );
    if (matchingArea) {
      saToAreaId[item.sa.toUpperCase()] = matchingArea.id_area;
    }
  }

  for (const sa of allServiceAreas) {
    if (!sa.nama_sa) continue;
    
    const expectedAreaId = saToAreaId[sa.nama_sa.toUpperCase()];
    
    if (expectedAreaId && sa.area_id !== expectedAreaId) {
      await prisma.service_area.update({
        where: { id_sa: sa.id_sa },
        data: { area_id: expectedAreaId },
      });
      updatedSAs++;
    }
  }

  console.log(`   ✅ Updated ${updatedSAs} service_area records`);

  // Step 8: Re-enable foreign key checks
  console.log('8️⃣  Re-enabling foreign key checks...');
  await execRaw('SET FOREIGN_KEY_CHECKS = 1');

  // Final verification
  console.log('\n📊 Final counts:');
  console.log(`   Regions: ${await prisma.region.count()}`);
  console.log(`   Branches: ${await prisma.branch.count()}`);
  console.log(`   Areas: ${await prisma.area.count()}`);
  console.log(`   Service Areas: ${await prisma.service_area.count()}`);

  const areasWithoutBranch = await prisma.area.count({ where: { branch_id: null } });
  console.log(`\n⚠️  Areas without branch_id: ${areasWithoutBranch}`);

  if (areasWithoutBranch > 0) {
    const sampleAreas = await prisma.area.findMany({ 
      where: { branch_id: null }, 
      take: 10 
    });
    console.log('   Sample:', sampleAreas.map(a => a.nama_area).join(', '));
  }

  console.log('\n✅ Migration complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
