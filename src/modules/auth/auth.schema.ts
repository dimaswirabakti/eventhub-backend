import { z } from 'zod';

// Sub-schema untuk profile EO
const eoProfileSchema = z.object({
  organizationName: z.string().min(2).max(100),
  organizationType: z.enum(['BEM', 'HIMA', 'UKM', 'COMMUNITY', 'OTHER']),
  campus: z.string().max(100).optional(),
  phoneNumber: z.string().min(10).max(20),
  city: z.string().min(2).max(50),
  description: z.string().max(1000).optional(),
});

// Sub-schema untuk profile Company
const companyProfileSchema = z.object({
  companyName: z.string().min(2).max(100),
  industry: z.string().min(2).max(50),
  description: z.string().min(10).max(1000),
  website: z.string().url().optional(),
  phoneNumber: z.string().min(10).max(20),
  city: z.string().min(2).max(50),
  targetAudience: z.string().max(500).optional(),
});

// Register, butuh role dan salah satu profile sesuai role
export const registerSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('EO'),
    name: z.string().min(2).max(100),
    profile: eoProfileSchema,
  }),
  z.object({
    role: z.literal('COMPANY'),
    name: z.string().min(2).max(100),
    profile: companyProfileSchema,
  }),
]);

export type RegisterInput = z.infer<typeof registerSchema>;
