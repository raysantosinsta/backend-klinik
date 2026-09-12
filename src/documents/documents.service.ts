import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createClient } from '@supabase/supabase-js';
import { extname } from 'path';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { pipeline } from '@xenova/transformers';

@Injectable()
export class DocumentsService {
  private supabase;

  constructor(private prisma: PrismaService) {
    this.supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );
  }

  async upload(file: Express.Multer.File, businessId: string) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = extname(file.originalname);
    const filename = `${businessId}/${uniqueSuffix}${extension}`;

    // Upload pro Supabase Storage
    const { data, error } = await this.supabase.storage
      .from('pdfs')
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) {
      throw new Error(`Falha no upload para o Supabase: ${error.message}`);
    }

    const { data: publicUrlData } = this.supabase.storage
      .from('pdfs')
      .getPublicUrl(filename);

    const storageUrl = publicUrlData.publicUrl;

    // Salva o documento no banco
    const document = await this.prisma.document.create({
      data: {
        filename: file.originalname,
        storageUrl,
        businessId,
      },
    });

    // Processar o PDF para extrair texto e criar os vetores (LangChain)
    try {
      console.log('Extraindo texto do PDF...');
      const blob = new Blob([new Uint8Array(file.buffer)], { type: 'application/pdf' });
      const loader = new PDFLoader(blob);
      const docs = await loader.load();

      console.log('Quebrando o texto em chunks...');
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const splitDocs = await splitter.splitDocuments(docs);

      console.log(`Carregando modelo local Xenova/all-MiniLM-L6-v2 (sem API Key) para gerar embeddings...`);
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

      // Salvar cada chunk e seu vetor no banco usando executeRaw
      for (const splitDoc of splitDocs) {
        const textContent = splitDoc.pageContent;
        if (!textContent || textContent.trim() === '') continue;

        // Gera o vetor diretamente com a biblioteca local do HuggingFace
        const output = await extractor(textContent, { pooling: 'mean', normalize: true });
        const vector = Array.from(output.data);

        if (!vector || vector.length === 0) {
          console.warn('Vetor vazio retornado, pulando chunk:', textContent.substring(0, 50));
          continue;
        }

        const vectorString = `[${vector.join(',')}]`;

        await this.prisma.$executeRaw`
          INSERT INTO "DocumentChunk" ("id", "content", "embedding", "documentId")
          VALUES (gen_random_uuid(), ${textContent}, ${vectorString}::vector, ${document.id})
        `;
      }
      
      console.log('Base vetorial gerada com sucesso!');
    } catch (err) {
      console.error('Erro ao gerar vetores:', err);
    }

    return document;
  }
}
