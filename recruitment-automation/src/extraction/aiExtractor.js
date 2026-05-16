import Anthropic from '@anthropic-ai/sdk';
import config from '../../config/config.js';
import logger from '../logging/logger.js';

const client = new Anthropic({ apiKey: config.ai.apiKey });

const SYSTEM_PROMPT = `Jesteś ekspertem od polskich dokumentów HR i rekrutacji.
Twoje zadanie to ekstrakcja danych kandydata z tekstu dokumentu PDF.
Dokumenty mogą być CV, formularzami zgłoszeniowymi, skierowaniami od agencji pracy lub umowami.
Zawsze zwracaj odpowiedź w formacie JSON. Jeśli pole nie jest dostępne, użyj null.
Nie wymyślaj danych — używaj tylko tego, co jest jawnie podane w tekście.
Daty formatuj jako YYYY-MM-DD. Telefon jako +48XXXXXXXXX lub oryginalny format jeśli nie polski.`;

const USER_PROMPT = (text, emailContext) => `
Poniżej znajduje się tekst wyodrębniony z dokumentu PDF kandydata do pracy.
${emailContext ? `\nKontekst z e-maila: ${emailContext}\n` : ''}

=== TREŚĆ DOKUMENTU ===
${text.slice(0, 8000)}
=== KONIEC DOKUMENTU ===

Wyodrębnij poniższe dane i zwróć TYLKO obiekt JSON (bez markdown, bez wyjaśnień):

{
  "firstName": "imię kandydata",
  "lastName": "nazwisko kandydata",
  "phone": "numer telefonu w formacie +48XXXXXXXXX lub null",
  "email": "adres email lub null",
  "pesel": "11-cyfrowy PESEL lub null",
  "citizenship": "obywatelstwo (np. Polska, Ukraina) lub null",
  "jobPosition": "stanowisko/rola lub null",
  "hourlyRate": "stawka godzinowa jako string (np. '25 PLN/h') lub null",
  "startDate": "data rozpoczęcia pracy w formacie YYYY-MM-DD lub null",
  "notes": "dodatkowe informacje: wykształcenie, doświadczenie, uwagi rekrutera lub null",
  "sourceAgency": "nazwa agencji/pośrednika jeśli widoczna lub null",
  "confidence": "high|medium|low — twoja pewność co do jakości ekstrakcji"
}`;

export async function extractCandidateData(pdfText, emailContext = '') {
  if (!pdfText || pdfText.trim().length < 10) {
    logger.warn('PDF text too short for extraction');
    return { error: 'PDF text too short', raw: null };
  }

  try {
    const message = await client.messages.create({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: USER_PROMPT(pdfText, emailContext) },
      ],
    });

    const raw = message.content[0]?.text || '';
    logger.debug('AI raw response', { chars: raw.length });

    // Strip potential markdown code fences
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.error('AI returned non-JSON', { raw: raw.slice(0, 300) });
      return { error: 'AI response not valid JSON', raw };
    }

    logger.info('Extraction complete', {
      candidate: `${parsed.firstName} ${parsed.lastName}`,
      confidence: parsed.confidence,
    });

    return { data: parsed, raw, error: null };
  } catch (err) {
    logger.error('AI extraction failed', { err: err.message });
    return { error: err.message, raw: null };
  }
}

// Standalone test
if (process.argv.includes('--test')) {
  const sample = `
    Imię i nazwisko: Jan Kowalski
    Telefon: 501 234 567
    Email: jan.kowalski@example.com
    PESEL: 90010112345
    Obywatelstwo: Polska
    Stanowisko: Operator wózka widłowego
    Stawka: 28 PLN/h
    Data rozpoczęcia: 2025-02-01
  `;
  const result = await extractCandidateData(sample, 'CV od agencji XYZ');
  console.log(JSON.stringify(result, null, 2));
}
