import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Alterando a coluna embedding para suportar 384 dimensões (Xenova)...')
  
  // Como o Prisma não percebeu a mudança de dimensão por ser do tipo Unsupported, 
  // nós forçamos a alteração da coluna direto no Postgres
  await prisma.$executeRawUnsafe(`ALTER TABLE "DocumentChunk" ALTER COLUMN embedding TYPE vector(384);`)
  
  console.log('Banco de dados atualizado com sucesso!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
