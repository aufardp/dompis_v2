import { queryCandidateSummary } from '../app/libs/priority/queries';

async function main() {
  try {
    console.log('Testing PKL...');
    const res = await queryCandidateSummary('PKL');
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

main();