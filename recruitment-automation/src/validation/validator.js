import { z } from 'zod';
import { normalizePhone } from '../utils/helpers.js';
import logger from '../logging/logger.js';

// PESEL checksum validation (Polish national ID)
function validatePesel(pesel) {
  if (!pesel || typeof pesel !== 'string') return false;
  const p = pesel.replace(/\D/g, '');
  if (p.length !== 11) return false;

  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const digits = p.split('').map(Number);
  const checksum = weights.reduce((sum, w, i) => sum + w * digits[i], 0);
  const controlDigit = (10 - (checksum % 10)) % 10;
  return controlDigit === digits[10];
}

function extractPeselBirthdate(pesel) {
  if (!pesel || pesel.length !== 11) return null;
  let year = parseInt(pesel.slice(0, 2));
  let month = parseInt(pesel.slice(2, 4));

  if (month >= 81 && month <= 92) { year += 1800; month -= 80; }
  else if (month >= 21 && month <= 32) { year += 2000; month -= 20; }
  else if (month >= 41 && month <= 52) { year += 2100; month -= 40; }
  else if (month >= 61 && month <= 72) { year += 2200; month -= 60; }
  else { year += 1900; }

  const day = parseInt(pesel.slice(4, 6));
  return new Date(year, month - 1, day).toISOString().split('T')[0];
}

const CandidateSchema = z.object({
  firstName: z.string().min(1, 'First name required').max(100),
  lastName: z.string().min(1, 'Last name required').max(100),
  phone: z.string().nullable().optional(),
  email: z.string().email('Invalid email').nullable().optional(),
  pesel: z.string().nullable().optional(),
  citizenship: z.string().nullable().optional(),
  jobPosition: z.string().nullable().optional(),
  hourlyRate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sourceAgency: z.string().nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

export function validateCandidate(raw) {
  const errors = [];
  const warnings = [];

  // Zod schema validation
  const result = CandidateSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  const data = result.success ? { ...result.data } : { ...raw };

  // PESEL validation
  if (data.pesel) {
    const peselClean = String(data.pesel).replace(/\D/g, '');
    if (!validatePesel(peselClean)) {
      errors.push(`PESEL checksum invalid: ${data.pesel}`);
    } else {
      data.pesel = peselClean;
      data._peselBirthdate = extractPeselBirthdate(peselClean);
    }
  } else {
    warnings.push('PESEL missing — required for Polish employment');
  }

  // Phone normalization
  if (data.phone) {
    data.phone = normalizePhone(data.phone);
  } else {
    warnings.push('Phone number missing');
  }

  // Start date sanity check
  if (data.startDate) {
    const d = new Date(data.startDate);
    if (isNaN(d.getTime())) {
      warnings.push(`Start date unparseable: ${data.startDate}`);
      data.startDate = null;
    }
  }

  // Low confidence AI extraction
  if (raw.confidence === 'low') {
    warnings.push('AI extraction confidence is low — manual review recommended');
  }

  const valid = errors.length === 0;
  if (!valid) {
    logger.warn('Validation failed', { errors, candidate: `${data.firstName} ${data.lastName}` });
  } else {
    logger.info('Validation passed', {
      candidate: `${data.firstName} ${data.lastName}`,
      warnings: warnings.length,
    });
  }

  return { valid, data, errors, warnings };
}

// Standalone test
if (process.argv.includes('--test')) {
  const cases = [
    {
      firstName: 'Jan', lastName: 'Kowalski', phone: '501234567',
      pesel: '90010112345', email: 'jan@example.com',
      citizenship: 'Polska', jobPosition: 'Operator', confidence: 'high',
    },
    {
      firstName: '', lastName: 'Nowak', pesel: '11111111111', confidence: 'low',
    },
  ];
  for (const c of cases) {
    console.log(JSON.stringify(validateCandidate(c), null, 2));
  }
}
