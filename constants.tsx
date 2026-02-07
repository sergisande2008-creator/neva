
import { MenuItem, Category } from './types';

export const CATEGORIES: Category[] = ["Todos", "Entrante", "Primero", "Segundo Carne", "Segundo Pescado", "Postre", "Bebida"];

export const MENU_ITEMS: MenuItem[] = [
  {
    id: '1',
    name: 'Tabla de quesos y jamón',
    price: 16.00,
    description: 'Selección de jamón ibérico de bellota y quesos artesanos con picos y frutos secos.',
    category: 'Entrante',
    dietTags: ['Omnívoro'],
    allergens: ['gluten', 'lácteos', 'frutos secos'],
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?q=80&w=600&auto=format&fit=crop',
    isChefSuggestion: true
  },
  {
    id: '2',
    name: 'Camarones al ajillo',
    price: 14.00,
    description: 'Camarones salteados con ajo, perejil fresco, guindilla y vino blanco.',
    category: 'Entrante',
    dietTags: ['Omnívoro'],
    allergens: ['marisco'],
    image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?q=80&w=600&auto=format&fit=crop',
    isChefSuggestion: true
  },
  {
    id: '3',
    name: 'Tabla vegana',
    price: 12.00,
    description: 'Hummus artesano, guacamole casero, crudités y pan integral tostado.',
    category: 'Entrante',
    dietTags: ['Vegano', 'Saludable'],
    allergens: ['gluten', 'sésamo'],
    image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: '4',
    name: 'Sopa de cebolla',
    price: 9.00,
    description: 'Sopa tradicional caramelizada, gratinada con queso Gruyère.',
    category: 'Primero',
    dietTags: ['Omnívoro'],
    allergens: ['gluten', 'lácteos'],
    image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: '5',
    name: 'Crema de verduras',
    price: 10.00,
    description: 'Crema sedosa de verduras de temporada con semillas de calabaza.',
    category: 'Primero',
    dietTags: ['Vegano', 'Celíaco'],
    allergens: [],
    image: 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: '6',
    name: 'Entrecot a la brasa',
    price: 24.00,
    description: 'Ternera madurada 30 días con patatas baby y pimientos de padrón.',
    category: 'Segundo Carne',
    dietTags: ['Omnívoro'],
    allergens: [],
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: '7',
    name: 'Salmón con hierbas',
    price: 20.00,
    description: 'Suprema de salmón al horno con espárragos y costra de hierbas finas.',
    category: 'Segundo Pescado',
    dietTags: ['Omnívoro'],
    allergens: ['pescado'],
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: '8',
    name: 'Coulant de chocolate',
    price: 8.00,
    description: 'Bizcocho fundente con helado de vainilla Bourbon artesanal.',
    category: 'Postre',
    dietTags: ['Omnívoro'],
    allergens: ['gluten', 'lácteos', 'huevo'],
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: '9',
    name: 'Vino tinto reserva',
    price: 5.00,
    description: 'Copa de Ribera del Duero o Rioja de excelente añada.',
    category: 'Bebida',
    dietTags: ['Vegano'],
    allergens: ['sulfitos'],
    image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: '10',
    name: 'Agua mineral gas',
    price: 3.00,
    description: 'Agua de manantial natural o con burbuja fina.',
    category: 'Bebida',
    dietTags: ['Vegano', 'Celíaco'],
    allergens: [],
    image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?q=80&w=600&auto=format&fit=crop'
  }
];
