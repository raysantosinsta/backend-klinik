// backend/scripts/test-sheets-integration.js
const fs = require('fs');
const path = require('path');

// Carrega .env manualmente caso dotenv não esteja instalado
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const webhookUrl = process.argv[2] || process.env.GOOGLE_SHEETS_WEBHOOK_URL;
const targetSpreadsheetId = process.argv[3] || process.env.TEST_SPREADSHEET_ID || undefined;

async function run() {
  console.log('====================================================');
  console.log('🧪 TESTE PRÁTICO: DISPARO DE AGENDAMENTO -> GOOGLE SHEETS (HUB MULTI-TENANT)');
  console.log('====================================================\n');

  if (!webhookUrl || webhookUrl.trim() === '') {
    console.error('❌ ERRO: Nenhuma URL de Webhook foi informada!');
    console.log('👉 Você pode:');
    console.log('   1. Configurar GOOGLE_SHEETS_WEBHOOK_URL no arquivo backend/.env');
    console.log('   2. Ou rodar passando a URL diretamente:');
    console.log('      node scripts/test-sheets-integration.js "https://script.google.com/macros/s/.../exec" [SPREADSHEET_ID]\n');
    process.exit(1);
  }

  console.log(`🎯 URL do Hub Google Apps Script: ${webhookUrl}`);
  if (targetSpreadsheetId) {
    console.log(`📑 ID da Planilha Alvo (Multi-Tenant): ${targetSpreadsheetId}`);
  } else {
    console.log(`📑 Planilha Alvo: Planilha Padrão (onde o script foi criado)`);
  }
  console.log('');

  const mockPayload = {
    event: 'appointment.confirmed',
    id: 'test-' + Math.random().toString(36).substring(2, 9),
    businessId: 'biz-klinik-demo',
    businessName: 'Clínica Estética Klinik',
    spreadsheetId: targetSpreadsheetId,
    clientName: 'Ana Clara Albuquerque',
    clientPhone: '+55 11 98765-4321',
    serviceName: 'Limpeza de Pele Profunda + Hidratação',
    servicePrice: 190.0,
    serviceDuration: 60,
    date: new Date(Date.now() + 86400000).toISOString(),
    dateFormatted: 'Amanhã às 15:30',
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
  };

  console.log('📦 Dados enviados (Payload):');
  console.dir(mockPayload, { depth: null, colors: true });
  console.log('\n🚀 Enviando requisição POST...');

  try {
    const startTime = Date.now();
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockPayload),
      redirect: 'follow',
    });

    const elapsed = Date.now() - startTime;
    const responseText = await res.text();

    console.log(`\n⏱️ Resposta recebida em ${elapsed}ms`);
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    console.log(`Resposta do Servidor: ${responseText}`);

    if (res.ok) {
      console.log('\n✅ SUCESSO! A planilha recebeu o agendamento com sucesso.');
      console.log('👉 Abra sua planilha do Google Sheets para conferir a nova linha inserida!');
    } else {
      console.error('\n⚠️ Atenção: O servidor retornou um status não-200. Verifique as permissões de acesso do App da Web.');
    }
  } catch (err) {
    console.error('\n❌ Falha na conexão:', err.message);
  }
}

run();
