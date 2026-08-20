import type { MockWorld } from '../src/adapters/mock.ts'

/**
 * The acceptance-test world: an Italian restaurant in Tel Aviv that is genuinely
 * romantic and makes pasta by hand, but whose web presence barely says so — while two
 * competitors say it loudly. Exactly the situation the product exists to fix.
 */
export const rosaWorld = (): MockWorld => ({
  providerBias: { openai: 0.4, gemini: -0.2, anthropic: 0.8 },
  businesses: [
    {
      name: 'Rosa',
      aliases: ['רוזה', 'Rosa Tel Aviv'],
      city: 'Tel Aviv',
      domain: 'rosa.example.com',
      // Low evidence for the attributes it actually has: the controllable gap.
      attributes: { handmade_pasta: 0.35, romantic: 0.15, quiet: 0.2, upscale: 0.3 },
      authority: 0.35,
      sources: [{ url: 'https://rosa.example.com/', title: 'Rosa — Italian restaurant' }],
    },
    {
      name: 'Vito',
      city: 'Tel Aviv',
      domain: 'vito.example.com',
      attributes: { romantic: 0.9, handmade_pasta: 0.7, quiet: 0.6, upscale: 0.7 },
      authority: 0.7,
      sources: [
        { url: 'https://vito.example.com/date-night', title: 'Vito — date night in Tel Aviv' },
        { url: 'https://timeout.example.com/tlv/romantic', title: 'Most romantic restaurants' },
        { url: 'https://mako.example.com/food/vito', title: 'Vito review' },
      ],
    },
    {
      name: 'Bella Napoli',
      city: 'Tel Aviv',
      domain: 'bellanapoli.example.com',
      attributes: { family_friendly: 0.8, handmade_pasta: 0.6, budget_friendly: 0.7 },
      authority: 0.55,
      sources: [
        { url: 'https://bellanapoli.example.com/', title: 'Bella Napoli' },
        { url: 'https://directory.example.com/bella', title: 'Bella Napoli listing' },
      ],
    },
    {
      name: 'Trattoria Yafo',
      city: 'Tel Aviv',
      domain: 'trattoriayafo.example.com',
      attributes: { romantic: 0.6, outdoor_seating: 0.8, upscale: 0.5 },
      authority: 0.5,
      sources: [{ url: 'https://trattoriayafo.example.com/', title: 'Trattoria Yafo' }],
    },
    {
      name: 'Pasta Bar Jerusalem',
      city: 'Jerusalem',
      domain: 'pastabar.example.com',
      attributes: { handmade_pasta: 0.9, romantic: 0.5 },
      authority: 0.6,
      sources: [{ url: 'https://pastabar.example.com/', title: 'Pasta Bar' }],
    },
  ],
})
