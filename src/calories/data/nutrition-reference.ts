/**
 * Sample food nutrition reference (per 100g or per standard serving).
 * Used for fallback and sent to AI for context. Easy to extend without code changes
 * if loaded from DB/JSON later.
 */
export interface NutritionReferencePer100 {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  vitamins?: { vitaminA?: number; vitaminBComplex?: number; vitaminC?: number; vitaminD?: number; vitaminE?: number };
  minerals?: { calcium?: number; iron?: number; magnesium?: number; potassium?: number; sodium?: number; zinc?: number };
}

export interface FoodReference {
  id: string;
  name: string;
  /** Default unit for display */
  defaultUnit: 'pieces' | 'cups' | 'grams' | 'serving' | 'ml';
  /** Grams per 1 unit (e.g. 1 piece dosa ≈ 80g, 1 cup rice ≈ 195g) */
  gramsPerUnit: number;
  per100g: NutritionReferencePer100;
  /** If true, unit dropdown includes ml (milliliters). */
  liquid?: boolean;
}

/** Sample foods: dosa, chicken variants, egg, tea, rice, guava. Values approximate (ICMR/Indian dietary references). */
export const NUTRITION_REFERENCE: FoodReference[] = [
  {
    id: 'dosa',
    name: 'Dosa',
    defaultUnit: 'pieces',
    gramsPerUnit: 80,
    per100g: {
      calories: 133,
      protein: 3.6,
      carbohydrates: 22,
      fat: 3.2,
      fiber: 1.2,
      vitamins: { vitaminBComplex: 0.08, vitaminC: 0 },
      minerals: { calcium: 18, iron: 1.2, magnesium: 22, potassium: 120, sodium: 420, zinc: 0.4 },
    },
  },
  {
    id: 'chicken-boiled',
    name: 'Chicken (boiled)',
    defaultUnit: 'grams',
    gramsPerUnit: 100,
    per100g: {
      calories: 165,
      protein: 31,
      carbohydrates: 0,
      fat: 3.6,
      fiber: 0,
      vitamins: { vitaminA: 30, vitaminBComplex: 0.4, vitaminD: 0.2 },
      minerals: { calcium: 15, iron: 1.2, magnesium: 28, potassium: 256, sodium: 74, zinc: 1.8 },
    },
  },
  {
    id: 'chicken-grilled',
    name: 'Chicken (grilled)',
    defaultUnit: 'grams',
    gramsPerUnit: 100,
    per100g: {
      calories: 190,
      protein: 29,
      carbohydrates: 0,
      fat: 7.4,
      fiber: 0,
      vitamins: { vitaminA: 35, vitaminBComplex: 0.35 },
      minerals: { calcium: 14, iron: 1.1, magnesium: 26, potassium: 240, sodium: 82, zinc: 1.6 },
    },
  },
  {
    id: 'chicken-curry',
    name: 'Chicken curry',
    defaultUnit: 'serving',
    gramsPerUnit: 150,
    per100g: {
      calories: 180,
      protein: 18,
      carbohydrates: 4,
      fat: 10,
      fiber: 0.5,
      vitamins: { vitaminA: 25, vitaminBComplex: 0.2, vitaminC: 2 },
      minerals: { calcium: 20, iron: 1.5, magnesium: 25, potassium: 220, sodium: 380, zinc: 1.2 },
    },
  },
  {
    id: 'scrambled-egg',
    name: 'Scrambled egg',
    defaultUnit: 'pieces',
    gramsPerUnit: 55,
    per100g: {
      calories: 196,
      protein: 13.6,
      carbohydrates: 1.6,
      fat: 15,
      fiber: 0,
      vitamins: { vitaminA: 520, vitaminBComplex: 0.35, vitaminD: 2.2, vitaminE: 1.1 },
      minerals: { calcium: 56, iron: 1.8, magnesium: 12, potassium: 138, sodium: 170, zinc: 1.3 },
    },
  },
  {
    id: 'tea-milk-sugar',
    name: 'Tea (with milk & sugar)',
    defaultUnit: 'cups',
    gramsPerUnit: 200,
    liquid: true,
    per100g: {
      calories: 35,
      protein: 1.2,
      carbohydrates: 6,
      fat: 0.8,
      fiber: 0,
      vitamins: { vitaminBComplex: 0.02 },
      minerals: { calcium: 45, iron: 0.1, magnesium: 5, potassium: 50, sodium: 15, zinc: 0.1 },
    },
  },
  {
    id: 'tea-plain',
    name: 'Tea (plain)',
    defaultUnit: 'cups',
    gramsPerUnit: 200,
    liquid: true,
    per100g: {
      calories: 2,
      protein: 0.1,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
      vitamins: {},
      minerals: { magnesium: 3, potassium: 40, sodium: 5 },
    },
  },
  {
    id: 'rice-white',
    name: 'Rice (white)',
    defaultUnit: 'cups',
    gramsPerUnit: 195,
    per100g: {
      calories: 130,
      protein: 2.7,
      carbohydrates: 28,
      fat: 0.3,
      fiber: 0.4,
      vitamins: { vitaminBComplex: 0.05 },
      minerals: { calcium: 10, iron: 0.2, magnesium: 12, potassium: 35, sodium: 1, zinc: 0.5 },
    },
  },
  {
    id: 'rice-brown',
    name: 'Rice (brown)',
    defaultUnit: 'cups',
    gramsPerUnit: 195,
    per100g: {
      calories: 112,
      protein: 2.6,
      carbohydrates: 24,
      fat: 0.9,
      fiber: 1.8,
      vitamins: { vitaminBComplex: 0.12 },
      minerals: { calcium: 10, iron: 0.4, magnesium: 43, potassium: 79, sodium: 5, zinc: 0.6 },
    },
  },
  {
    id: 'guava',
    name: 'Guava',
    defaultUnit: 'pieces',
    gramsPerUnit: 100,
    per100g: {
      calories: 68,
      protein: 2.6,
      carbohydrates: 14,
      fat: 1,
      fiber: 5.4,
      vitamins: { vitaminA: 31, vitaminBComplex: 0.11, vitaminC: 228, vitaminE: 0.7 },
      minerals: { calcium: 18, iron: 0.26, magnesium: 22, potassium: 417, sodium: 2, zinc: 0.23 },
    },
  },
  {
    id: 'idli',
    name: 'Idli',
    defaultUnit: 'pieces',
    gramsPerUnit: 50,
    per100g: {
      calories: 106,
      protein: 2.2,
      carbohydrates: 21,
      fat: 0.4,
      fiber: 0.6,
      vitamins: { vitaminBComplex: 0.04 },
      minerals: { calcium: 18, iron: 0.8, magnesium: 12, potassium: 65, sodium: 320, zinc: 0.3 },
    },
  },
  {
    id: 'paneer',
    name: 'Paneer',
    defaultUnit: 'grams',
    gramsPerUnit: 100,
    per100g: {
      calories: 265,
      protein: 18,
      carbohydrates: 3.5,
      fat: 20,
      fiber: 0,
      vitamins: { vitaminA: 180, vitaminBComplex: 0.1, vitaminD: 0.1 },
      minerals: { calcium: 480, iron: 0.2, magnesium: 18, potassium: 78, sodium: 18, zinc: 0.6 },
    },
  },
  {
    id: 'orange',
    name: 'Orange',
    defaultUnit: 'pieces',
    gramsPerUnit: 130,
    per100g: {
      calories: 47,
      protein: 0.9,
      carbohydrates: 12,
      fat: 0.1,
      fiber: 2.4,
      vitamins: { vitaminA: 11, vitaminBComplex: 0.09, vitaminC: 53, vitaminE: 0.2 },
      minerals: { calcium: 40, iron: 0.1, magnesium: 10, potassium: 181, sodium: 0, zinc: 0.07 },
    },
  },
];
