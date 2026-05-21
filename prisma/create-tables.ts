import prisma from '../app/libs/prisma';

async function main() {
  console.log('Creating tables...');
  
  // Create region table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS region (
      id_region INT AUTO_INCREMENT PRIMARY KEY,
      nama_region VARCHAR(100) NOT NULL UNIQUE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('Created region table');

  // Add region_id to area table
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE area ADD COLUMN region_id INT
    `);
    console.log('Added region_id to area');
  } catch (e: any) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('region_id column already exists');
    } else {
      throw e;
    }
  }

  // Add FK to area
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE area ADD FOREIGN KEY (region_id) REFERENCES region(id_region)
    `);
    console.log('Added FK to area');
  } catch (e: any) {
    if (e.message?.includes('Duplicate key name')) {
      console.log('FK already exists');
    } else {
      console.log('FK may already exist:', e.message);
    }
  }

  // Create workzone table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS workzone (
        id_workzone INT AUTO_INCREMENT PRIMARY KEY,
        kode VARCHAR(10) NOT NULL UNIQUE,
        sa_id INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sa_id (sa_id)
      )
    `);
    console.log('Created workzone table');
  } catch (e: any) {
    if (e.code === 'ER_TABLE_EXISTS') {
      console.log('workzone table already exists');
    } else {
      throw e;
    }
  }

  // Add FK to workzone
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE workzone ADD FOREIGN KEY (sa_id) REFERENCES service_area(id_sa)
    `);
    console.log('Added FK to workzone');
  } catch (e: any) {
    console.log('FK may already exist:', e.message);
  }

  console.log('All tables created!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });