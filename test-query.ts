import { PrismaClient } from '@prisma/client';
import { pipeline } from '@xenova/transformers';

const prisma = new PrismaClient();

async function main() {
  const businesses = await prisma.business.findMany();
  const businessId = businesses[0].id;

  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const message = 'qual o horario de funcionamento?';
  const output = await extractor(message, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data);
  const vectorString = `[${vector.join(',')}]`;

  console.log('Querying DB with businessId', businessId);

  const chunks: any[] = await prisma.$queryRaw`
    SELECT "content", 1 - ("embedding" <=> ${vectorString}::vector) as similarity
    FROM "DocumentChunk"
    WHERE "documentId" IN (
      SELECT "id" FROM "Document" WHERE "businessId" = ${businessId}
    )
    ORDER BY "embedding" <=> ${vectorString}::vector
    LIMIT 3;
  `;
  console.log('Returned chunks length:', chunks?.length);
  console.log('Chunks:', chunks);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
